import { atsDetail, getJson } from './ats';
import { type AshbyJob, salaryOf as ashbySalary } from './ashby';
import { type GreenhouseJob, salaryOf as greenhouseSalary } from './greenhouse';
import { fetchWithRetry, mapConcurrent, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedSalary } from './types';

// Tau Ventures' careers page (an astro build) stopped listing jobs in
// october 2026: it is a grid of the portfolio companies now — a card each
// with the company's name, its industry and a link to wherever it hires —
// and the openings are read from there. A link into one of the applicant
// tracking systems we can read (ashby, greenhouse, lever, workable, kula)
// names the company's board on it; a link to the company's own careers page
// is followed one hop, to the first such board the page links or embeds. A
// company whose page shows no board we can read (a form to express interest,
// roles typed into the site's script) lists nothing, and so does one whose
// board is gone — Altitude's ashby board, at the time of writing. The board
// itself has no pages per job or company, so the links lead to the postings,
// and a posting's url is its key, as it was while the page listed the jobs
// by hand.

const BOARD_URL = 'https://www.tauventures.com/careers';

interface Company {
	name: string;
	// where the card sends you: the company's board, or its careers page
	url: string;
	sector: string;
}

const CARD = /<a\b[^>]*\bclass="[^"]*\bcareer-card\b[^"]*"[^>]*>[\s\S]*?<\/a>/g;

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

const attr = (tag: string, name: string) =>
	decode(tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? '').trim();

function companiesOn(html: string): Company[] {
	const companies: Company[] = [];
	for (const card of html.match(CARD) ?? []) {
		const tag = card.slice(0, card.indexOf('>') + 1);
		const url = attr(tag, 'href');
		// "View careers at Alaffia Health (opens in a new tab)"; the logo's
		// alt text failing that
		const name =
			attr(tag, 'aria-label')
				.replace(/^View careers at /, '')
				.replace(/ \(opens in a new tab\)$/, '') || attr(card.match(/<img\b[^>]*>/)?.[0] ?? '', 'alt');
		if (!url || !name) throw new Error(`${BOARD_URL}: could not read the card ${tag.slice(0, 80)}`);
		// a link straight into a board carries the embed's parameters
		// (?embed=js, ?not_found=true), which the board does without
		const link = boardOf(url) && !/[?&]for=/.test(url) ? url.replace(/\?.*$/, '') : url;
		companies.push({ name, url: link, sector: attr(tag, 'data-category') });
	}
	return companies;
}

type Ats = 'ashby' | 'greenhouse' | 'lever' | 'workable' | 'kula';

interface Board {
	ats: Ats;
	token: string;
	eu?: boolean;
}

// the board a link names, when it is on a system we can read:
//   jobs.ashbyhq.com/<org>[/<posting>]
//   boards.greenhouse.io/<token>, job-boards.greenhouse.io/<token>, and the
//     embed, …/embed/job_board?for=<token>
//   jobs.lever.co/<company>[/<posting>] (jobs.eu.lever.co too)
//   apply.workable.com/<account>[/j/<shortcode>]
//   careers.kula.ai/<org>[/<posting>]
function boardOf(link: string): Board | null {
	let url: URL;
	try {
		url = new URL(link);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();
	const [first] = url.pathname.split('/').filter(Boolean);
	if (!first) return null;
	if (host === 'jobs.ashbyhq.com') return { ats: 'ashby', token: first };
	if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
		const token = first === 'embed' ? url.searchParams.get('for') : first;
		return token ? { ats: 'greenhouse', token } : null;
	}
	if (/^jobs(\.eu)?\.lever\.co$/.test(host))
		return { ats: 'lever', token: first, eu: host.includes('.eu.') };
	if (host === 'apply.workable.com' && first !== 'j' && first !== 'api')
		return { ats: 'workable', token: first };
	if (host === 'careers.kula.ai') return { ats: 'kula', token: first };
	return null;
}

// the first board a company's own careers page links to or embeds; null
// when it has none, or the page is gone
async function boardOnPage(page: string): Promise<Board | null> {
	const resp = await fetchWithRetry(page);
	if (resp.status === 404 || resp.status === 410) return null;
	if (!resp.ok) throw new Error(`${page}: the page answered ${resp.status}`);
	const html = await resp.text();
	for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
		const board = boardOf(decode(m[0]));
		if (board) return board;
	}
	return null;
}

const posting = (c: Company, url: string): ScrapedJob => ({
	key: url.replace(/^https?:\/\//, ''),
	company: c.name,
	companyUrl: c.url,
	title: '',
	url,
	applyUrl: url,
	category: '',
	sector: c.sector,
	location: '',
	salary: null,
	postedAt: null
});

// every reader lists the board's postings, or answers null for a board that
// is gone from its system (the api says 404)

async function ashby(c: Company, { token }: Board): Promise<ScrapedJob[] | null> {
	const data = await getJson<{ jobs?: AshbyJob[] }>(
		`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`
	);
	if (!data) return null;
	return (data.jobs ?? [])
		.filter((j) => j.id && j.jobUrl && j.isListed !== false)
		.map((j) => {
			const places = [j.location ?? '', ...(j.secondaryLocations ?? []).map((l) => l.location ?? '')];
			const locations = [...new Set(places.map((p) => p.trim()).filter(Boolean))].join('; ');
			const mode = j.isRemote && !/remote/i.test(locations) ? 'remote' : '';
			return {
				...posting(c, j.jobUrl!),
				title: (j.title ?? '').trim(),
				category: (j.department ?? j.team ?? '').trim(),
				location: [locations, mode].filter(Boolean).join(' · '),
				salary: ashbySalary(j),
				postedAt: j.publishedAt ? new Date(j.publishedAt) : null
			};
		});
}

// the departments come only along with the content (the descriptions,
// read again by the enrichment pass through ats.ts)
async function greenhouse(c: Company, { token }: Board): Promise<ScrapedJob[] | null> {
	const data = await getJson<{ jobs?: GreenhouseJob[] }>(
		`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`
	);
	if (!data) return null;
	return (data.jobs ?? [])
		.filter((j) => j.id && j.absolute_url)
		.map((j) => ({
			...posting(c, j.absolute_url!),
			title: (j.title ?? '').trim(),
			category: (j.departments ?? [])
				.map((d) => (d.name ?? '').trim())
				.filter(Boolean)
				.join(', '),
			location: (j.location?.name ?? '').trim(),
			salary: greenhouseSalary(j),
			postedAt: j.first_published ? new Date(j.first_published) : null
		}));
}

interface LeverJob {
	id?: string;
	text?: string | null;
	hostedUrl?: string | null;
	categories?: { location?: string | null; team?: string | null } | null;
	createdAt?: number | null;
}

async function lever(c: Company, { token, eu }: Board): Promise<ScrapedJob[] | null> {
	const postings = await getJson<LeverJob[]>(
		`https://api${eu ? '.eu' : ''}.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`
	);
	if (!postings) return null;
	return postings
		.filter((j) => j.id && j.hostedUrl)
		.map((j) => ({
			...posting(c, j.hostedUrl!),
			title: (j.text ?? '').trim(),
			category: (j.categories?.team ?? '').trim(),
			location: (j.categories?.location ?? '').trim(),
			postedAt: j.createdAt ? new Date(j.createdAt) : null
		}));
}

interface WorkableJob {
	title?: string | null;
	shortcode?: string | null;
	department?: string | null;
	city?: string | null;
	state?: string | null;
	country?: string | null;
	telecommuting?: boolean | null;
	published_on?: string | null;
	locations?:
		| { city?: string | null; region?: string | null; country?: string | null; hidden?: boolean | null }[]
		| null;
}

// workable's widget api, the one a careers page's embed reads
async function workable(c: Company, { token }: Board): Promise<ScrapedJob[] | null> {
	const data = await getJson<{ jobs?: WorkableJob[] }>(
		`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}`
	);
	if (!data) return null;
	const place = (parts: (string | null | undefined)[]) =>
		parts
			.map((p) => (p ?? '').trim())
			.filter(Boolean)
			.join(', ');
	return (data.jobs ?? [])
		.filter((j) => j.shortcode)
		.map((j) => {
			const places = (j.locations ?? [])
				.filter((l) => !l.hidden)
				.map((l) => place([l.city, l.region, l.country]));
			if (places.length === 0) places.push(place([j.city, j.state, j.country]));
			const locations = [...new Set(places.filter(Boolean))].join('; ');
			const mode = j.telecommuting && !/remote/i.test(locations) ? 'remote' : '';
			return {
				...posting(c, `https://apply.workable.com/${token}/j/${j.shortcode}/`),
				title: (j.title ?? '').trim(),
				category: (j.department ?? '').trim(),
				location: [locations, mode].filter(Boolean).join(' · '),
				postedAt: j.published_on ? new Date(j.published_on) : null
			};
		});
}

interface KulaJob {
	id?: number;
	title?: string | null;
	listed?: boolean | null;
	launch_at?: string | null;
	ats_job?: {
		workplace?: string | null;
		ats_department?: { name?: string | null } | null;
		offices?: { name?: string | null; location?: string | null }[] | null;
		compensation?: {
			base_salary?: {
				currency?: string | null;
				interval?: string | null;
				min_amount?: string | number | null;
				max_amount?: string | number | null;
			} | null;
		} | null;
	} | null;
}

function kulaSalary(job: KulaJob): ScrapedSalary | null {
	const pay = job.ats_job?.compensation?.base_salary;
	if (!pay) return null;
	const min = Number(pay.min_amount);
	const max = Number(pay.max_amount);
	if (!(min > 0) && !(max > 0)) return null;
	return {
		min: min > 0 ? min : null,
		max: max > 0 ? max : null,
		currency: (pay.currency ?? '').toUpperCase(),
		period: normalizePeriod(pay.interval)
	};
}

// the json array opening at text[start]
function jsonArrayAt(text: string, start: number): unknown[] | null {
	let depth = 0;
	let inString = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[' || ch === '{') depth++;
		else if (ch === ']' || ch === '}') {
			if (--depth > 0) continue;
			try {
				const value = JSON.parse(text.slice(start, i + 1));
				return Array.isArray(value) ? value : null;
			} catch {
				return null;
			}
		}
	}
	return null;
}

// kula's hosted board (careers.kula.ai/<org>) is a next.js page that ships
// its jobs to the browser as json inside the react server components
// payload — one string, pushed onto self.__next_f in chunks
async function kula(c: Company, { token }: Board): Promise<ScrapedJob[] | null> {
	const page = `https://careers.kula.ai/${encodeURIComponent(token)}`;
	const resp = await fetchWithRetry(page);
	if (resp.status === 404 || resp.status === 410) return null;
	if (!resp.ok) throw new Error(`${page}: the page answered ${resp.status}`);
	const html = await resp.text();
	const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)]
		.map((m) => JSON.parse(m[1]) as string)
		.join('');
	let jobs: KulaJob[] | undefined;
	for (const m of payload.matchAll(/"jobs":\[/g)) {
		const list = jsonArrayAt(payload, m.index + '"jobs":'.length);
		if (list && list.every((j) => typeof j === 'object' && j !== null && 'title' in j)) {
			jobs = list as KulaJob[];
			break;
		}
	}
	if (!jobs) throw new Error(`${page}: the page carries no job list`);
	return jobs
		.filter((j) => j.id && j.listed !== false)
		.map((j) => {
			const ats = j.ats_job ?? {};
			const offices = [
				...new Set((ats.offices ?? []).map((o) => (o.name ?? o.location ?? '').trim()).filter(Boolean))
			].join('; ');
			// 'remote' | 'hybrid' | 'office'; "Remote - United States" says it already
			const workplace = (ats.workplace ?? '').toLowerCase();
			const mode =
				(workplace === 'remote' || workplace === 'hybrid') && !new RegExp(workplace, 'i').test(offices)
					? workplace
					: '';
			return {
				...posting(c, `https://careers.kula.ai/${token}/${j.id}`),
				title: (j.title ?? '').trim(),
				category: (ats.ats_department?.name ?? '').trim(),
				location: [offices, mode].filter(Boolean).join(' · '),
				salary: kulaSalary(j),
				postedAt: j.launch_at ? new Date(j.launch_at) : null
			};
		});
}

const readers: Record<Ats, (c: Company, board: Board) => Promise<ScrapedJob[] | null>> = {
	ashby,
	greenhouse,
	lever,
	workable,
	kula
};

async function jobsOf(c: Company): Promise<ScrapedJob[]> {
	const board = boardOf(c.url) ?? (await boardOnPage(c.url));
	if (!board) return [];
	const jobs = await readers[board.ats](c, board);
	return (jobs ?? []).filter((j) => j.title);
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD_URL);
		if (!resp.ok) throw new Error(`${BOARD_URL}: answered ${resp.status}`);
		const companies = companiesOn(await resp.text());
		if (companies.length === 0) throw new Error(`${BOARD_URL}: the board lists no companies`);
		const lists = await mapConcurrent(companies, 4, jobsOf);
		const byKey = new Map<string, ScrapedJob>();
		for (const j of lists.flat()) if (!byKey.has(j.key)) byKey.set(j.key, j);
		if (byKey.size === 0) throw new Error(`${BOARD_URL}: the companies' boards list no jobs`);
		return [...byKey.values()];
	},

	detail({ applyUrl }) {
		return atsDetail(applyUrl);
	}
};
