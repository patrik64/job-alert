// GET /api/v1/jobs — the jobs that turned up on the boards in a recent
// window, narrowed the way someone looking for work asks: what the job is
// (words in its title or job function, the rss feeds' topics), where it can
// be done from (remote, regions) and what it pays. A posting several funds
// list comes once, with all of them; newest first; as json or as a markdown
// list of direct links. Read-only and public like the rest of the data —
// the cdn keeps each distinct query for an hour (see hooks.server.ts).

import type { RequestEvent } from '@sveltejs/kit';
import { remult, SqlDatabase } from 'remult';
import { api } from './api';
import { TOPICS, type Topic, type TopicName } from './feeds';
import { inRegions, isRemote, REGIONS, regionsOf, type Region } from './regions';
import { formatSalary } from '../lib/salary';
import { fundName } from '../shared/funds';
import { LIVE_URL, REPO_URL } from '../shared/site';

const MAX_DAYS = 30;
const DEFAULT_DAYS = 14;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_OFFSET = 100_000;
const MAX_TERMS = 20;
const MAX_TERM_LENGTH = 60;

const REMOTE_CHOICES = ['any', 'only', 'none'] as const;
const SALARY_CHOICES = ['any', 'only'] as const;
const FORMATS = ['json', 'md'] as const;
const REGION_CHOICES = [...REGIONS, 'unknown'] as const;

// every parameter there is, as a line of help — an error hands them all back
const PARAMETERS: Record<string, string> = {
	days: `the window: jobs first seen in the last n days, 1–${MAX_DAYS} (default ${DEFAULT_DAYS})`,
	since: `the window from this ISO date or time instead, at most ${MAX_DAYS} days back`,
	title:
		'words in the title or job function, comma-separated, any of them — whole words in any case; a space or hyphen in a word also matches none ("back end" finds Backend and Back-End); a trailing * matches word beginnings (engineer*)',
	exclude: 'words that rule a job out, matched as in title',
	company: 'words in the company name, matched as in title',
	fund: 'fund slugs, any of them (the slug of each fund is in /api/funds)',
	topic: `the rss feeds' topics, any of them: ${Object.keys(TOPICS).join(', ')}`,
	remote: `${REMOTE_CHOICES.join(' | ')} — as the location line says (default any)`,
	region: `where the job can be done from, any of: ${REGION_CHOICES.join(', ')} — read off the location line; a job for Europe, EMEA or anywhere worldwide counts in each region it spans; unknown is a line naming no place ("Remote")`,
	salary: `${SALARY_CHOICES.join(' | ')} — only: jobs publishing a figure (default any)`,
	currency: 'only figures in this currency, an ISO code such as EUR',
	minSalary: 'a yearly figure reaching at least this much, in the given currency',
	limit: `jobs a page, 1–${MAX_LIMIT} (default ${DEFAULT_LIMIT})`,
	offset: 'jobs to skip — the next page is in the answer',
	format: `${FORMATS.join(' | ')} — md: a markdown list of links grouped by company (default json)`
};

export class QueryError extends Error {}

interface Term {
	text: string;
	prefix: boolean;
}

export interface JobsQuery {
	since: Date;
	days: number | null;
	title: Term[];
	exclude: Term[];
	company: Term[];
	fund: string[];
	topic: TopicName[];
	remote: (typeof REMOTE_CHOICES)[number];
	region: (Region | 'unknown')[];
	salary: (typeof SALARY_CHOICES)[number];
	currency: string | null;
	minSalary: number | null;
	limit: number;
	offset: number;
	format: (typeof FORMATS)[number];
}

// the query string, checked strictly — a misspelt parameter silently
// ignored would answer another question than the one asked
export function parseQuery(params: URLSearchParams, now: Date): JobsQuery {
	for (const name of new Set(params.keys()))
		if (!(name in PARAMETERS)) throw new QueryError(`there is no parameter "${name}"`);

	const one = (name: string) => {
		const values = params.getAll(name);
		if (values.length > 1) throw new QueryError(`${name} is given ${values.length} times`);
		return values[0]?.trim() || null;
	};
	const list = (name: string) => [
		...new Set(
			params
				.getAll(name)
				.flatMap((v) => v.split(','))
				.map((v) => v.trim())
				.filter(Boolean)
		)
	];
	const choices = <T extends string>(name: string, options: readonly T[]): T[] =>
		list(name).map((v) => {
			const value = v.toLowerCase() as T;
			if (!options.includes(value))
				throw new QueryError(`${name} "${v}" is none of ${options.join(', ')}`);
			return value;
		});
	const choice = <T extends string>(name: string, options: readonly T[], fallback: T): T => {
		const v = one(name);
		if (v == null) return fallback;
		const value = v.toLowerCase() as T;
		if (!options.includes(value)) throw new QueryError(`${name} must be one of ${options.join(', ')}`);
		return value;
	};
	const whole = (name: string, min: number, max: number) => {
		const v = one(name);
		if (v == null) return null;
		const n = Number(v);
		if (!/^\d+$/.test(v) || n < min || n > max)
			throw new QueryError(`${name} must be a whole number from ${min} to ${max}`);
		return n;
	};
	const terms = (name: string): Term[] => {
		const values = list(name);
		if (values.length > MAX_TERMS) throw new QueryError(`${name} takes ${MAX_TERMS} words at most`);
		return values.map((v) => {
			const prefix = v.endsWith('*');
			const text = (prefix ? v.slice(0, -1) : v).trim();
			if (text.includes('*')) throw new QueryError(`${name} "${v}": a * can only end a word`);
			if (text.length > MAX_TERM_LENGTH)
				throw new QueryError(`${name} "${v}" is longer than ${MAX_TERM_LENGTH} characters`);
			if (!/[\p{L}\p{N}]/u.test(text)) throw new QueryError(`${name} "${v}" has no letters in it`);
			return { text, prefix };
		});
	};

	const days = whole('days', 1, MAX_DAYS);
	const sinceText = one('since');
	if (days != null && sinceText != null) throw new QueryError('give days or since, not both');
	let since = new Date(now.getTime() - (days ?? DEFAULT_DAYS) * 86_400_000);
	if (sinceText != null) {
		since = new Date(sinceText);
		if (Number.isNaN(since.getTime())) throw new QueryError(`since "${sinceText}" is not a date`);
		if (since.getTime() < now.getTime() - MAX_DAYS * 86_400_000)
			throw new QueryError(`since reaches back ${MAX_DAYS} days at most`);
	}

	const fund = list('fund').map((v) => v.toLowerCase());
	const unknownFunds = fund.filter((slug) => !fundName.has(slug));
	if (unknownFunds.length)
		throw new QueryError(`no fund has the slug ${unknownFunds.map((s) => `"${s}"`).join(', ')}`);

	const currency = one('currency')?.toUpperCase() ?? null;
	if (currency != null && !/^[A-Z]{3}$/.test(currency))
		throw new QueryError('currency must be a three-letter ISO code such as EUR');
	const minSalaryText = one('minSalary');
	const minSalary = minSalaryText == null ? null : Number(minSalaryText);
	if (minSalary != null && (!/^\d+(\.\d+)?$/.test(minSalaryText ?? '') || minSalary <= 0))
		throw new QueryError('minSalary must be a positive number');
	if (minSalary != null && currency == null)
		throw new QueryError('minSalary needs a currency — pay is compared in one currency only');

	return {
		since,
		days: sinceText == null ? (days ?? DEFAULT_DAYS) : null,
		title: terms('title'),
		exclude: terms('exclude'),
		company: terms('company'),
		fund,
		topic: choices('topic', Object.keys(TOPICS) as TopicName[]),
		remote: choice('remote', REMOTE_CHOICES, 'any'),
		region: choices('region', REGION_CHOICES),
		salary: choice('salary', SALARY_CHOICES, 'any'),
		currency,
		minSalary,
		limit: whole('limit', 1, MAX_LIMIT) ?? DEFAULT_LIMIT,
		offset: whole('offset', 0, MAX_OFFSET) ?? 0,
		format: choice('format', FORMATS, 'json')
	};
}

// words as a postgres pattern, matched in any case: each a whole word or,
// with its *, the start of one; a space or hyphen within a word matches
// any run of them, or none
const escapeRegex = (s: string) => s.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&');
const termsPattern = (terms: Term[]) =>
	`(?:^|[^a-z0-9])(?:${terms
		.map(
			({ text, prefix }) =>
				text.split(/[\s-]+/).filter(Boolean).map(escapeRegex).join('[\\s-]*') +
				(prefix ? '' : '(?:[^a-z0-9]|$)')
		)
		.join('|')})`;

// a feed's pattern in postgres's dialect, where a word boundary is \y
const posix = (re: RegExp) => re.source.replaceAll('\\b', '\\y');
const operator = (re: RegExp) => (re.flags.includes('i') ? '~*' : '~');

function topicCondition({ title, category, described }: Topic, param: (v: unknown) => string) {
	const tests = [
		`j.title ${operator(title)} ${param(posix(title))}`,
		`j.category ${operator(category)} ${param(posix(category))}`
	];
	if (described)
		tests.push(
			`j."detailKey" in (select d.id from job_details d where d.description ${described.exactCase ? '~' : '~*'} ${param(described.posix)})`
		);
	return `(${tests.join(' or ')})`;
}

// a column's value among a list — sent as json, since remult's parameters
// pass arrays as json text rather than as postgres arrays
const among = (column: string, values: string[], param: (v: unknown) => string) =>
	`${column} in (select jsonb_array_elements_text(${param(JSON.stringify(values))}::jsonb))`;

// the filters as sql over jobs j, cheapest first; the values go in as
// parameters (param returns the placeholder), the location lines that pass
// as a list
function conditions(
	q: JobsQuery,
	locations: string[] | undefined,
	param: (v: unknown) => string
): string[] {
	const where: string[] = [];
	if (q.fund.length) where.push(among('j."fundSlug"', q.fund, param));
	if (q.salary === 'only' || q.currency || q.minSalary != null)
		where.push('(j."salaryMin" is not null or j."salaryMax" is not null)');
	if (q.currency) where.push(`upper(j."salaryCurrency") = ${param(q.currency)}`);
	if (q.minSalary != null)
		where.push(
			`j."salaryPeriod" = 'year' and coalesce(j."salaryMax", j."salaryMin") >= ${param(q.minSalary)}`
		);
	if (locations) where.push(among('j.location', locations, param));
	if (q.company.length) where.push(`j.company ~* ${param(termsPattern(q.company))}`);
	if (q.title.length) {
		const words = param(termsPattern(q.title));
		where.push(`(j.title ~* ${words} or j.category ~* ${words})`);
	}
	if (q.exclude.length) {
		const words = param(termsPattern(q.exclude));
		where.push(`not (j.title ~* ${words} or j.category ~* ${words})`);
	}
	if (q.topic.length)
		where.push(`(${q.topic.map((t) => topicCondition(TOPICS[t], param)).join(' or ')})`);
	return where;
}

// conditions tested in the order given, each only while the ones before it
// hold. Postgres otherwise orders a query's conditions by its own cost
// estimates, which rate a regex as cheap as a list lookup — and a regex over
// every row of the window takes it the better part of a second
const inOrder = (conds: string[]) =>
	conds.length === 0
		? 'true'
		: conds.length === 1
			? conds[0]
			: `case when ${conds[0]} then ${conds.slice(1).join(' and ')} else false end`;

// the distinct location lines of the jobs any window can reach, each with
// what it says (see regions.ts) — read at most every few minutes a server
// instance: they change once a night, and ten thousand of them take
// milliseconds to read here where postgres needs seconds
interface Line {
	location: string;
	remote: boolean;
	regions: Region[];
}
const LINES_TTL_MS = 10 * 60_000;
let lines: { at: number; list: Line[] } | undefined;

async function locationLines(db: SqlDatabase): Promise<Line[]> {
	if (lines && Date.now() - lines.at < LINES_TTL_MS) return lines.list;
	const { rows } = await db.execute(
		`select distinct location from jobs
		 where baseline = false and "firstSeenAt" >= now() - interval '${MAX_DAYS} days'`
	);
	const list = rows.map((r) => {
		const location = String(r.location);
		return { location, remote: isRemote(location), regions: regionsOf(location) };
	});
	lines = { at: Date.now(), list };
	return list;
}

// a posting as the query returns it: its earliest listing, and every fund
// listing it
interface PostingRow {
	company: string;
	title: string;
	url: string;
	applyUrl: string;
	category: string;
	location: string;
	salaryMin: number | null;
	salaryMax: number | null;
	salaryCurrency: string;
	salaryPeriod: string;
	firstSeenAt: string;
	funds: string[];
}

export async function findJobs(
	db: SqlDatabase,
	q: JobsQuery
): Promise<{ total: number; postings: PostingRow[] }> {
	// the location filters pick lines here, and the query takes the jobs at
	// the lines picked
	let locations: string[] | undefined;
	if (q.remote !== 'any' || q.region.length) {
		locations = (await locationLines(db))
			.filter(
				(l) =>
					(q.remote === 'any' || l.remote === (q.remote === 'only')) &&
					(q.region.length === 0 || inRegions(l.regions, q.region))
			)
			.map((l) => l.location);
		if (locations.length === 0) return { total: 0, postings: [] };
	}

	const command = db.createCommand();
	const param = (v: unknown) => command.param(v);
	const filters = inOrder(conditions(q, locations, param));
	// a posting is its link and title: the funds listing the same one share
	// the link (see Job.detailKey), while a careers page some companies send
	// all their jobs to is told apart by the title
	const { rows } = await command.execute(`
		with hits as (
			select j.id, j."fundSlug", j.company, j.title, j.url, j."applyUrl", j.category,
				j.location, j."salaryMin", j."salaryMax", j."salaryCurrency", j."salaryPeriod",
				j."detailKey", j."firstSeenAt"
			from jobs j
			where j.baseline = false and j."firstSeenAt" >= ${param(q.since)} and ${filters}
		),
		firsts as (
			select distinct on ("detailKey", lower(title)) *
			from hits
			order by "detailKey", lower(title), "firstSeenAt", id
		),
		listed as (
			select "detailKey", lower(title) as t, array_agg(distinct "fundSlug") as funds
			from hits
			group by 1, 2
		),
		postings as (
			select f.*, l.funds
			from firsts f
			join listed l on l."detailKey" = f."detailKey" and l.t = lower(f.title)
		)
		select
			(select count(*) from postings)::int as total,
			coalesce(
				(select json_agg(p order by p."firstSeenAt" desc, p.company, p.title, p.id)
				 from (
					select * from postings
					order by "firstSeenAt" desc, company, title, id
					limit ${param(q.limit)} offset ${param(q.offset)}
				 ) p),
				'[]'::json
			) as postings`);
	return { total: Number(rows[0].total), postings: rows[0].postings as PostingRow[] };
}

// a job as the api hands it out
interface ApiJob {
	company: string;
	title: string;
	// the ad itself, on the company's careers site or applicant tracking
	// system where the board knows it, else the job's page on the board
	url: string;
	// the job's page on the fund's board (a board without job pages: the
	// company's page there)
	boardUrl: string;
	funds: { slug: string; name: string }[];
	location: string;
	remote: boolean;
	// the regions the location line puts the job in; none when it names no
	// place
	regions: Region[];
	category: string;
	salary: {
		min: number | null;
		max: number | null;
		currency: string;
		period: string;
		text: string;
	} | null;
	firstSeenAt: string;
}

const toApiJob = (p: PostingRow): ApiJob => ({
	company: p.company,
	title: p.title,
	url: /^https?:\/\//i.test(p.applyUrl) ? p.applyUrl : p.url,
	boardUrl: p.url,
	funds: p.funds.map((slug) => ({ slug, name: fundName.get(slug) ?? slug })),
	location: p.location,
	remote: isRemote(p.location),
	regions: regionsOf(p.location),
	category: p.category,
	salary:
		p.salaryMin == null && p.salaryMax == null
			? null
			: {
					min: p.salaryMin,
					max: p.salaryMax,
					currency: p.salaryCurrency,
					period: p.salaryPeriod,
					text: formatSalary(p)
				},
	firstSeenAt: new Date(p.firstSeenAt).toISOString()
});

const termText = ({ text, prefix }: Term) => (prefix ? `${text}*` : text);

// the query as it was understood, defaults included
const echo = (q: JobsQuery) => ({
	days: q.days,
	since: q.since.toISOString(),
	title: q.title.map(termText),
	exclude: q.exclude.map(termText),
	company: q.company.map(termText),
	fund: q.fund,
	topic: q.topic,
	remote: q.remote,
	region: q.region,
	salary: q.salary,
	currency: q.currency,
	minSalary: q.minSalary,
	limit: q.limit,
	offset: q.offset,
	format: q.format
});

// the markdown list: a heading saying what was asked, then the postings
// grouped by company in the order they came, each a link to the ad
const escapeMarkdown = (s: string) => s.replace(/[\\`*_[\]<>]/g, '\\$&');
const escapeLink = (url: string) => url.replace(/[()<>\s]/g, (c) => encodeURIComponent(c));
const day = (iso: string) => iso.slice(0, 10);

function markdown(q: JobsQuery, now: Date, total: number, jobs: ApiJob[], next: string | null) {
	const asked = [
		q.remote === 'only' ? 'remote' : q.remote === 'none' ? 'not remote' : '',
		q.region.length ? `in ${q.region.join(', ')}` : '',
		q.title.length ? `title: ${q.title.map(termText).join(', ')}` : '',
		q.exclude.length ? `excluding: ${q.exclude.map(termText).join(', ')}` : '',
		q.company.length ? `company: ${q.company.map(termText).join(', ')}` : '',
		q.topic.length ? `topic: ${q.topic.join(', ')}` : '',
		q.fund.length ? `fund: ${q.fund.map((s) => fundName.get(s) ?? s).join(', ')}` : '',
		q.minSalary != null
			? `from ${q.minSalary} ${q.currency} a year`
			: q.currency
				? `paid in ${q.currency}`
				: q.salary === 'only'
					? 'with a salary'
					: ''
	].filter(Boolean);
	const lines = [
		`# ${total} ${total === 1 ? 'job' : 'jobs'} first seen ${day(q.since.toISOString())} – ${day(now.toISOString())}`,
		'',
		...(asked.length ? [`${asked.join(' · ')}`, ''] : [])
	];
	if (jobs.length === 0) lines.push(q.offset > 0 ? 'No more jobs.' : 'No job matched.');
	else {
		lines.push(
			`Newest first, ${q.offset + 1}–${q.offset + jobs.length} of ${total}. Collected by job alert, ${LIVE_URL}`
		);
		const byCompany = new Map<string, ApiJob[]>();
		for (const job of jobs) {
			const list = byCompany.get(job.company);
			if (list) list.push(job);
			else byCompany.set(job.company, [job]);
		}
		for (const [company, list] of byCompany) {
			lines.push('', `## ${escapeMarkdown(company || 'Unnamed company')}`);
			for (const job of list) {
				const details = [
					job.location,
					job.salary?.text ?? '',
					day(job.firstSeenAt),
					job.funds.map((f) => f.name).join(', ')
				].filter(Boolean);
				lines.push(
					`- [${escapeMarkdown(job.title)}](${escapeLink(job.url)}) — ${escapeMarkdown(details.join(' · '))}`
				);
			}
		}
	}
	if (next) lines.push('', `${total - q.offset - jobs.length} more: ${next}`);
	return lines.join('\n') + '\n';
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Access-Control-Allow-Origin': '*'
		}
	});

export async function jobsApiResponse(event: RequestEvent): Promise<Response> {
	const now = new Date();
	let q: JobsQuery;
	try {
		q = parseQuery(event.url.searchParams, now);
	} catch (err) {
		if (!(err instanceof QueryError)) throw err;
		return json({ error: err.message, parameters: PARAMETERS, docs: `${REPO_URL}#api` }, 400);
	}
	return api.withRemult(event, async () => {
		const db = remult.dataProvider;
		if (!(db instanceof SqlDatabase))
			return json(
				{ error: 'the jobs api runs its queries in postgres; the json files of local development have none' },
				501
			);
		const { total, postings } = await findJobs(db, q);
		const jobs = postings.map(toApiJob);
		let next: string | null = null;
		if (q.offset + jobs.length < total) {
			const url = new URL(event.url);
			url.searchParams.set('offset', String(q.offset + q.limit));
			next = url.toString();
		}
		if (q.format === 'md')
			return new Response(markdown(q, now, total, jobs, next), {
				// plain text, which every browser shows rather than downloads
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Access-Control-Allow-Origin': '*'
				}
			});
		return json({
			query: echo(q),
			window: { from: q.since.toISOString(), to: now.toISOString() },
			total,
			count: jobs.length,
			next,
			jobs
		});
	});
}
