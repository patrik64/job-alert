// The numbers behind the statistics page. Every night, once the boards are
// refreshed, the night's newcomers are counted — by fund, by company, by job
// function, by the feeds' topics, by where they are — into the statistics
// ledger (StatisticsRow), one row a day, and every month's numbers are summed
// from the days into one summary row the page reads. The ledger exists
// because a job leaves the database with its board: a month counted again
// later, from the jobs still listed, would come up short of what its nights
// found. The days are those of the nightly run's timezone (see rss.ts), so a
// night's finds stay together.

import { remult, repo, SqlDatabase } from 'remult';
import { readTopic, TOPICS, type TopicName } from './feeds';
import { areasOf, isRemote, type Area } from './regions';
import { dayKey } from './rss';
import { Fund } from '../shared/Fund';
import { fundName } from '../shared/funds';
import { Job } from '../shared/Job';
import { StatisticsRow } from '../shared/StatisticsRow';

export const TOPIC_NAMES = Object.keys(TOPICS) as TopicName[];

// how many of a day's companies and job functions its row names, and how
// many bars a month's rankings show
const KEPT_COMPANIES = 100;
const KEPT_FUNCTIONS = 60;
const TOP = 10;
// how far back one call may count
const MAX_DAYS = 120;
// a board's fetch still stands for the night while it is this young
const FETCH_CURRENT_MS = 36 * 3_600_000;
const SUMMARY = 'summary';

export interface Tally {
	label: string;
	count: number;
}

export interface FundTally extends Tally {
	slug: string;
}

// one day's row of the ledger
export interface DayCounts {
	// YYYY-MM-DD
	day: string;
	// the listings, and the distinct postings among them — a posting two
	// funds list is one posting and two listings
	jobs: number;
	postings: number;
	// listings by fund, every fund that added any
	funds: Record<string, number>;
	// the companies with the most listings, and the job functions named most
	companies: Tally[];
	functions: Tally[];
	// the listings each feed's topic takes, by the feeds' own test
	topics: Record<TopicName, number>;
	// listings by the area their location names (see regions.ts), 'none' for
	// a location naming no place; one naming several counts in each
	regions: Record<string, number>;
	remote: number;
	salaried: number;
	// the jobs listed across every board and the boards fetched without
	// error, as they stood that night — a reading of the moment, so null for
	// a day counted after the fact
	listed: number | null;
	boards: number | null;
}

export interface TopicStatistics {
	total: number;
	days: (number | null)[];
}

export interface MonthStatistics {
	// YYYY-MM
	month: string;
	// the listings each day brought; null for a day that could bring none —
	// before the ledger began, or still to come
	days: (number | null)[];
	// the days whose counts were rebuilt after the fact, from what was still
	// listed then
	reconstructed: number;
	jobs: number;
	postings: number;
	// the funds that added any, and those that added the most
	funds: number;
	topFunds: FundTally[];
	topCompanies: Tally[];
	topFunctions: Tally[];
	topics: Record<TopicName, TopicStatistics>;
	// the areas the listings' locations name most, and the listings naming
	// no place
	regions: Tally[];
	unplaced: number;
	remote: number;
	salaried: number;
	// the boards' standing by day, where it was read
	listed: (number | null)[];
	boards: (number | null)[];
}

export interface Statistics {
	computedAt: string;
	// every month since the ledger began, oldest first
	months: MonthStatistics[];
}

// what a night's newcomer is counted by
interface NewcomerRow {
	fundSlug: string;
	company: string;
	title: string;
	category: string;
	location: string;
	detailKey: string;
	salaried: boolean;
	firstSeenAt: Date;
}

// the newcomers since a moment — the few columns the counting reads, through
// sql; the json fallback of local development loads them whole
async function newcomersSince(since: Date): Promise<NewcomerRow[]> {
	const db = remult.dataProvider;
	if (db instanceof SqlDatabase) {
		const command = db.createCommand();
		const { rows } = await command.execute(
			`select "fundSlug", company, title, category, location, "detailKey",
			        ("salaryMin" is not null or "salaryMax" is not null) as salaried, "firstSeenAt"
			 from jobs where baseline = false and "firstSeenAt" >= ${command.param(since)}`
		);
		return rows.map((r) => ({
			fundSlug: String(r.fundSlug),
			company: String(r.company),
			title: String(r.title),
			category: String(r.category),
			location: String(r.location),
			detailKey: String(r.detailKey),
			salaried: Boolean(r.salaried),
			firstSeenAt: new Date(r.firstSeenAt)
		}));
	}
	const found = await repo(Job).find({
		where: { baseline: false, firstSeenAt: { $gte: since } },
		limit: 1_000_000
	});
	return found.flatMap((j) =>
		j.firstSeenAt
			? [
					{
						fundSlug: j.fundSlug,
						company: j.company,
						title: j.title,
						category: j.category,
						location: j.location,
						detailKey: j.detailKey,
						salaried: j.salaryMin != null || j.salaryMax != null,
						firstSeenAt: j.firstSeenAt
					}
				]
			: []
	);
}

// a name in any case and spacing
const keyOf = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

// a tally that keeps how its entries are spelt: of the spellings sharing a
// key, the one seen most is the one shown
class Tallies {
	private counts = new Map<string, Map<string, number>>();

	add(label: string, n = 1) {
		const spelling = label.trim();
		if (!spelling) return;
		const key = keyOf(spelling);
		let spellings = this.counts.get(key);
		if (!spellings) this.counts.set(key, (spellings = new Map()));
		spellings.set(spelling, (spellings.get(spelling) ?? 0) + n);
	}

	// the largest first, a tie by name, so the order never shuffles
	ranked(limit: number): Tally[] {
		return [...this.counts.values()]
			.map((spellings) => {
				let count = 0;
				let label = '';
				let most = 0;
				for (const [spelling, n] of spellings) {
					count += n;
					if (n > most) (most = n), (label = spelling);
				}
				return { label, count };
			})
			.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
			.slice(0, limit);
	}
}

// the job functions a board files a job under: comma-joined, and on getro
// boards each with its parents in parentheses — "(Engineering), Software
// Engineering" — which would count a job twice over, so those stay out
const functionsOf = (category: string) =>
	category
		.split(',')
		.map((tag) => tag.trim())
		.filter((tag) => tag && !tag.startsWith('('));

type Matcher = {
	name: TopicName;
	match: (job: Pick<NewcomerRow, 'title' | 'category' | 'detailKey'>) => boolean;
};

// the feeds' topics, each ready to judge a job as its feed would
async function topicMatchers(): Promise<Matcher[]> {
	const matchers: Matcher[] = [];
	for (const name of TOPIC_NAMES) matchers.push({ name, match: (await readTopic(TOPICS[name])).match });
	return matchers;
}

const noTopics = () => Object.fromEntries(TOPIC_NAMES.map((n) => [n, 0])) as Record<TopicName, number>;

function countDay(day: string, rows: NewcomerRow[], matchers: Matcher[]): DayCounts {
	const postings = new Set<string>();
	const funds: Record<string, number> = {};
	const companies = new Tallies();
	const functions = new Tallies();
	const topics = noTopics();
	const regions: Record<string, number> = {};
	let remote = 0;
	let salaried = 0;
	for (const row of rows) {
		postings.add(`${row.detailKey}\n${row.title.toLowerCase()}`);
		funds[row.fundSlug] = (funds[row.fundSlug] ?? 0) + 1;
		companies.add(row.company);
		for (const tag of functionsOf(row.category)) functions.add(tag);
		for (const { name, match } of matchers) if (match(row)) topics[name]++;
		const areas = areasOf(row.location);
		if (areas.size === 0) regions.none = (regions.none ?? 0) + 1;
		for (const area of areas) regions[area] = (regions[area] ?? 0) + 1;
		if (isRemote(row.location)) remote++;
		if (row.salaried) salaried++;
	}
	return {
		day,
		jobs: rows.length,
		postings: postings.size,
		funds,
		companies: companies.ranked(KEPT_COMPANIES),
		functions: functions.ranked(KEPT_FUNCTIONS),
		topics,
		regions,
		remote,
		salaried,
		listed: null,
		boards: null
	};
}

// the day some days on from a YYYY-MM-DD, by the calendar alone
const shifted = (day: string, by: number) => {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
};

// count the latest days into the ledger and sum the summary anew. The two
// latest days are counted every night — a run that fires twice, or late,
// adds to a day already counted — and the days before only where the ledger
// has no final row yet: a count rebuilt from the jobs still listed gains
// nothing by being rebuilt again later
export async function renderStatistics(days = 2): Promise<{ days: number; months: number }> {
	const now = new Date();
	const today = dayKey(now);
	const span = Math.min(MAX_DAYS, Math.max(2, Math.floor(days) || 2));
	const wanted = Array.from({ length: span }, (_, i) => shifted(today, i - span + 1));
	const ledger = repo(StatisticsRow);
	const stored = new Map((await ledger.find({ limit: 10_000 })).map((r) => [r.id, r]));
	const latest = new Set(wanted.slice(-2));
	const compute = wanted.filter((day) => latest.has(day) || !stored.get(day)?.complete);

	if (compute.length) {
		// the newcomers landed on their days in the run's timezone: the read
		// starts a day early and the day key sorts them
		const since = new Date(now.getTime() - (span + 1) * 86_400_000);
		const [newcomers, matchers, funds] = await Promise.all([
			newcomersSince(since),
			topicMatchers(),
			repo(Fund).find({ limit: 1000 })
		]);
		const byDay = new Map<string, NewcomerRow[]>();
		for (const row of newcomers) {
			const day = dayKey(row.firstSeenAt);
			const list = byDay.get(day);
			if (list) list.push(row);
			else byDay.set(day, [row]);
		}
		const listed = funds.reduce((n, f) => n + f.jobCount, 0);
		const boards = funds.filter(
			(f) =>
				f.lastError === '' &&
				f.lastFetchedAt &&
				now.getTime() - f.lastFetchedAt.getTime() < FETCH_CURRENT_MS
		).length;

		for (const day of compute) {
			const counts = countDay(day, byDay.get(day) ?? [], matchers);
			// the boards' standing is read tonight for tonight; a day read
			// before keeps its own reading
			const row = stored.get(day);
			const earlier = row ? (JSON.parse(row.json) as DayCounts) : undefined;
			counts.listed = day === today ? listed : (earlier?.listed ?? null);
			counts.boards = day === today ? boards : (earlier?.boards ?? null);
			await ledger.upsert({
				where: { id: day },
				set: { json: JSON.stringify(counts), computedAt: now, complete: latest.has(day) }
			});
		}
	}

	const rows = (await ledger.find({ limit: 10_000 })).filter((r) => r.id !== SUMMARY);
	const summary = summarize(
		rows.map((r) => ({ counts: JSON.parse(r.json) as DayCounts, complete: r.complete })),
		now
	);
	await ledger.upsert({
		where: { id: SUMMARY },
		set: { json: JSON.stringify(summary), computedAt: now, complete: true }
	});
	return { days: compute.length, months: summary.months.length };
}

// what a location's area is called on the page
const AREA_LABEL: Record<Area, string> = {
	us: 'United States',
	canada: 'Canada',
	latam: 'Latin America',
	eu: 'EU',
	uk: 'UK',
	'europe-other': 'Europe outside the EU and UK',
	europe: 'Europe-wide',
	emea: 'EMEA',
	apac: 'Asia-Pacific',
	mena: 'Middle East and North Africa',
	africa: 'Africa',
	'north-america': 'North America-wide',
	americas: 'Americas-wide',
	worldwide: 'worldwide'
};

// a day the ledger has no row for — a night the run never came to counting —
// brought nothing it knows of
const emptyDay = (day: string): DayCounts => ({
	day,
	jobs: 0,
	postings: 0,
	funds: {},
	companies: [],
	functions: [],
	topics: noTopics(),
	regions: {},
	remote: 0,
	salaried: 0,
	listed: null,
	boards: null
});

// every month from the ledger's first day to the running one, a quiet one
// included, each summed from its days
export function summarize(rows: { counts: DayCounts; complete: boolean }[], now = new Date()): Statistics {
	const byDay = new Map(rows.map((r) => [r.counts.day, r]));
	// the ledger begins with its first find: a backfill reaching back past
	// the boards' baselines counts nights that could bring nothing
	const first = [...byDay.values()]
		.filter((r) => r.counts.jobs > 0)
		.map((r) => r.counts.day)
		.sort()[0];
	const today = dayKey(now);
	const months: MonthStatistics[] = [];
	if (!first) return { computedAt: now.toISOString(), months };

	for (let [year, month] = first.split('-').map(Number); ; month === 12 ? (year++, (month = 1)) : month++) {
		const key = `${year}-${String(month).padStart(2, '0')}`;
		if (key > today.slice(0, 7)) break;
		const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
		const dayKeys = Array.from({ length }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
		const counted = dayKeys.map((day) =>
			day >= first && day <= today ? (byDay.get(day)?.counts ?? emptyDay(day)) : null
		);
		const days = counted.filter((c): c is DayCounts => c != null);

		const funds = new Map<string, number>();
		const companies = new Tallies();
		const functions = new Tallies();
		const regions = new Map<string, number>();
		const topics = Object.fromEntries(
			TOPIC_NAMES.map((n) => [n, { total: 0, days: counted.map((c) => (c ? c.topics[n] ?? 0 : null)) }])
		) as Record<TopicName, TopicStatistics>;
		let unplaced = 0;
		for (const c of days) {
			for (const [slug, n] of Object.entries(c.funds)) funds.set(slug, (funds.get(slug) ?? 0) + n);
			for (const t of c.companies) companies.add(t.label, t.count);
			for (const t of c.functions) functions.add(t.label, t.count);
			for (const n of TOPIC_NAMES) topics[n].total += c.topics[n] ?? 0;
			for (const [area, n] of Object.entries(c.regions)) {
				if (area === 'none') unplaced += n;
				else regions.set(area, (regions.get(area) ?? 0) + n);
			}
		}
		const sum = (of: (c: DayCounts) => number) => days.reduce((n, c) => n + of(c), 0);

		months.push({
			month: key,
			days: counted.map((c) => (c ? c.jobs : null)),
			reconstructed: dayKeys.filter((day) => byDay.get(day) && !byDay.get(day)!.complete).length,
			jobs: sum((c) => c.jobs),
			postings: sum((c) => c.postings),
			funds: funds.size,
			topFunds: [...funds]
				.map(([slug, count]) => ({ slug, label: fundName.get(slug) ?? slug, count }))
				.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
				.slice(0, TOP),
			topCompanies: companies.ranked(TOP),
			topFunctions: functions.ranked(TOP),
			topics,
			regions: [...regions]
				.map(([area, count]) => ({ label: AREA_LABEL[area as Area] ?? area, count }))
				.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
				.slice(0, TOP),
			unplaced,
			remote: sum((c) => c.remote),
			salaried: sum((c) => c.salaried),
			listed: counted.map((c) => c?.listed ?? null),
			boards: counted.map((c) => c?.boards ?? null)
		});
	}
	return { computedAt: now.toISOString(), months };
}
