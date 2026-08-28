import { atsDetail } from './ats';
import { fetchWithRetry, mapConcurrent, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Consider has begun rebuilding its boards as server-rendered Next.js apps
// (first seen on jobs.a16z.com, 2026-08): the csrf-guarded search api of
// consider.ts is gone and jobs are paged through the app's
// "loadMorePublicJobs" server action instead, a hundred a page (0-indexed)
// and no cookies asked. The search stops answering past its first ten
// thousand jobs, so the crawl goes company by company — the /companies page
// server-renders every portfolio company with its job count — and no
// company comes near that line. A server action is addressed by an id
// minted anew with every deploy of the board, so the id is dug out of the
// script chunk that names the action and kept per host until a call stops
// working. Job records carry the platform's own id — the apply link's tail
// no longer works as a key, since boards send whole companies to one
// careers page.

const PAGE_SIZE = 100;

interface Labeled {
	label?: string | null;
	value?: string | null;
}

interface Company {
	id: string;
	slug: string;
	name: string;
	jobCount: number;
}

interface ActionJob {
	id?: string | null;
	title?: string | null;
	apply_url?: string | null;
	company_name?: string | null;
	company_slug?: string | null;
	locations?: string[] | null;
	remote?: boolean | null;
	hybrid?: boolean | null;
	salary_min?: number | null;
	salary_max?: number | null;
	salary_currency?: string | null;
	salary_period?: string | null;
	functions?: string[] | null;
	department?: string | null;
	job_markets?: Labeled[] | null;
	posted_at?: string | null;
}

interface ActionPage {
	jobs?: ActionJob[];
}

// the payload a next.js app server-renders is spread over escaped string
// pushes; joined back together they hold the page's data as plain json
function flightText(html: string): string {
	let text = '';
	for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
		text += JSON.parse(`"${m[1]}"`);
	}
	return text;
}

// the json array starting at `from`, found by bracket depth outside strings
function readArray(text: string, from: number): string {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = from; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '[') depth++;
		else if (ch === ']' && --depth === 0) return text.slice(from, i + 1);
	}
	throw new Error('unterminated array in the server payload');
}

async function fetchCompanies(base: string): Promise<Company[]> {
	const resp = await fetchWithRetry(`${base}/companies`);
	if (!resp.ok) throw new Error(`${base}: the companies page answered ${resp.status}`);
	const text = flightText(await resp.text());
	const at = text.indexOf('"companies":[');
	if (at < 0) throw new Error(`${base}: the companies page carries no company list`);
	return JSON.parse(readArray(text, at + '"companies":'.length)) as Company[];
}

async function findActionId(base: string): Promise<string> {
	const resp = await fetchWithRetry(`${base}/jobs`);
	if (!resp.ok) throw new Error(`${base}: the jobs page answered ${resp.status}`);
	const html = await resp.text();
	const origin = new URL(base).origin;
	const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[\w.-]+\.js/g) ?? [])];
	const ids = await mapConcurrent(chunks, 4, async (path) => {
		const chunk = await fetchWithRetry(`${origin}${path}`);
		if (!chunk.ok) return null;
		const m = (await chunk.text()).match(
			/createServerReference\)?\("([0-9a-f]{40,})"[^)]*"loadMorePublicJobs"\)/
		);
		return m?.[1] ?? null;
	});
	const id = ids.find(Boolean);
	if (!id) throw new Error(`${base}: no chunk names the loadMorePublicJobs action`);
	return id;
}

const actionIds = new Map<string, Promise<string>>();

function actionId(base: string, renew = false): Promise<string> {
	if (renew || !actionIds.has(base)) {
		const found = findActionId(base);
		found.catch(() => actionIds.delete(base));
		actionIds.set(base, found);
	}
	return actionIds.get(base)!;
}

// null means the action was not understood — most likely an id gone stale
async function callAction(
	base: string,
	id: string,
	companyId: string,
	page: number
): Promise<ActionPage | null> {
	const resp = await fetchWithRetry(`${base}/jobs`, {
		method: 'POST',
		headers: {
			accept: 'text/x-component',
			'content-type': 'text/plain;charset=UTF-8',
			'next-action': id
		},
		body: JSON.stringify([{}, { companyId, page, limit: PAGE_SIZE }])
	});
	if (!resp.ok) return null;
	// the response is a react flight stream; the result is the row whose
	// payload is the search's json
	const row = (await resp.text()).match(/^[0-9a-f]+:(\{"jobs".*)$/m)?.[1];
	return row ? (JSON.parse(row) as ActionPage) : null;
}

const label = (x: Labeled) => (x.label ?? x.value ?? '').trim();

function toJob(base: string, j: ActionJob): ScrapedJob | null {
	const key = (j.id ?? '').replace(/^consider:/, '');
	const companySlug = j.company_slug ?? '';
	if (!key || !companySlug) return null;
	const companyUrl = `${base}/jobs/${companySlug}`;
	const salary =
		j.salary_min || j.salary_max
			? {
					min: j.salary_min || null,
					max: j.salary_max || null,
					currency: (j.salary_currency ?? '').toUpperCase(),
					period: normalizePeriod(j.salary_period)
				}
			: null;
	const functions = (j.functions ?? []).map((f) => f.trim()).filter(Boolean);
	const locations = [...new Set((j.locations ?? []).map((l) => l.trim()).filter(Boolean))].join(
		'; '
	);
	// the work mode is said once, even when the locations already say it
	const mode = /remote|hybrid/i.test(locations) ? '' : j.remote ? 'remote' : j.hybrid ? 'hybrid' : '';
	return {
		key,
		company: j.company_name ?? '',
		companyUrl,
		title: j.title ?? '',
		url: companyUrl,
		applyUrl: j.apply_url ?? '',
		category: functions.length ? functions.join(', ') : (j.department ?? '').trim(),
		sector: (j.job_markets ?? []).map(label).filter(Boolean).join(', '),
		location: [locations, mode].filter(Boolean).join(' · '),
		salary,
		postedAt: j.posted_at ? new Date(j.posted_at) : null
	};
}

export function considerNextBoard({ host }: { host: string }): JobBoardScraper {
	const base = `https://${host}`;
	return {
		async list() {
			const hiring = (await fetchCompanies(base)).filter((c) => c.jobCount > 0);
			if (hiring.length === 0) throw new Error(`${base}: no company lists a job`);
			// probe the first company before fanning out: a dead action id
			// means the board deployed since it was cached — dig it out again
			let id = await actionId(base);
			if (!(await callAction(base, id, hiring[0].id, 0))) {
				id = await actionId(base, true);
				if (!(await callAction(base, id, hiring[0].id, 0))) {
					throw new Error(`${base}: the job search action answered nothing`);
				}
			}
			const byKey = new Map<string, ScrapedJob>();
			await mapConcurrent(hiring, 6, async (company) => {
				let got = 0;
				const lastPage = Math.ceil(company.jobCount / PAGE_SIZE) + 1;
				for (let page = 0; page <= lastPage; page++) {
					const data = await callAction(base, id, company.id, page);
					if (!data) throw new Error(`${base}: the job search failed on ${company.slug}`);
					let fresh = 0;
					for (const raw of data.jobs ?? []) {
						const job = toJob(base, raw);
						if (job && !byKey.has(job.key)) {
							byKey.set(job.key, job);
							fresh++;
						}
					}
					got += fresh;
					if (!fresh || got >= company.jobCount) break;
				}
			});
			if (byKey.size === 0) throw new Error(`${base}: the board lists no jobs`);
			// fail loudly rather than importing a partial list (see getro.ts)
			const total = hiring.reduce((n, c) => n + c.jobCount, 0);
			if (byKey.size < total * 0.95) {
				throw new Error(`${base}: collected ${byKey.size} of ${total} jobs`);
			}
			return [...byKey.values()];
		},

		detail(job) {
			return atsDetail(job.applyUrl);
		}
	};
}
