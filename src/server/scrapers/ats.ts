import { fetchWithRetry } from './http';
import type { ScrapedJobDetail } from './types';

// A board that carries no descriptions of its own still links every job to
// the posting on the company's applicant tracking system, and the big systems
// publish their postings through open apis. Those are read here; a posting
// on anything else simply stays without a description.

// greenhouse serves the description as html-escaped html
const ESCAPES: Record<string, string> = { quot: '"', '#39': "'", lt: '<', gt: '>', amp: '&' };
const unescapeHtml = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&(quot|#39|lt|gt|amp);/g, (_, e) => ESCAPES[e]);

const JSON_HEADERS = { accept: 'application/json' };

async function getJson<T>(url: string): Promise<T | null> {
	const resp = await fetchWithRetry(url, { headers: JSON_HEADERS });
	if (resp.status === 404 || resp.status === 410) return null;
	if (!resp.ok) throw new Error(`${resp.status} ${url}`);
	return (await resp.json()) as T;
}

// greenhouse: boards.greenhouse.io/<board>/jobs/<id> (also job-boards., .eu) —
// one api for all of them
async function greenhouse(board: string, id: string): Promise<ScrapedJobDetail | null> {
	const job = await getJson<{ content?: string | null }>(
		`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`
	);
	return job ? { description: unescapeHtml(job.content ?? '') } : null;
}

// ashby: jobs.ashbyhq.com/<org>/<uuid> — the api lists a whole company board
// at once, so a board is read once and kept for a while
interface AshbyJob {
	id?: string;
	descriptionHtml?: string | null;
	descriptionPlain?: string | null;
}
const ashbyBoards = new Map<string, { jobs: Promise<Map<string, AshbyJob> | null>; readAt: number }>();
const ASHBY_TTL_MS = 10 * 60_000;

function ashbyBoard(org: string): Promise<Map<string, AshbyJob> | null> {
	const cached = ashbyBoards.get(org);
	if (cached && Date.now() - cached.readAt < ASHBY_TTL_MS) return cached.jobs;
	const jobs = getJson<{ jobs?: AshbyJob[] }>(
		`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`
	).then((data) => (data ? new Map((data.jobs ?? []).map((j) => [j.id ?? '', j])) : null));
	ashbyBoards.set(org, { jobs, readAt: Date.now() });
	// a failed read is not kept
	jobs.catch(() => ashbyBoards.delete(org));
	return jobs;
}

async function ashby(org: string, id: string): Promise<ScrapedJobDetail | null> {
	const job = (await ashbyBoard(org))?.get(id);
	if (!job) return null;
	return { description: job.descriptionHtml ?? job.descriptionPlain ?? '' };
}

// lever: jobs.lever.co/<company>/<uuid> (also jobs.eu.lever.co) — the
// description comes in pieces: an opening, titled lists, a closing
interface LeverPosting {
	description?: string | null;
	lists?: { text?: string | null; content?: string | null }[] | null;
	additional?: string | null;
}
async function lever(company: string, id: string, eu: boolean): Promise<ScrapedJobDetail | null> {
	const posting = await getJson<LeverPosting>(
		`https://api${eu ? '.eu' : ''}.lever.co/v0/postings/${company}/${id}`
	);
	if (!posting) return null;
	const lists = (posting.lists ?? [])
		.map((l) => `<h3>${l.text ?? ''}</h3><ul>${l.content ?? ''}</ul>`)
		.join('');
	return { description: [posting.description ?? '', lists, posting.additional ?? ''].join('') };
}

// workday: <tenant>.wd<n>.myworkdayjobs.com/[<lang>/]<site>/job/<path> — the
// same path under /wday/cxs/<tenant>/<site>/ answers with json
async function workday(origin: string, tenant: string, site: string, path: string) {
	const data = await getJson<{ jobPostingInfo?: { jobDescription?: string | null } }>(
		`${origin}/wday/cxs/${tenant}/${site}/job/${path}`
	);
	if (!data?.jobPostingInfo) return null;
	return { description: data.jobPostingInfo.jobDescription ?? '' };
}

// the posting's description from its applicant tracking system; null when
// the system is not one of the known ones or the posting is gone from it
export async function atsDetail(applyUrl: string): Promise<ScrapedJobDetail | null> {
	let url: URL;
	try {
		url = new URL(applyUrl);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase();
	const path = url.pathname;

	let m: RegExpMatchArray | null;
	if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host) && (m = path.match(/^\/([^/]+)\/jobs\/(\d+)/))) {
		return greenhouse(m[1], m[2]);
	}
	if (host === 'jobs.ashbyhq.com' && (m = path.match(/^\/([^/]+)\/([0-9a-f-]{36})/i))) {
		return ashby(m[1], m[2].toLowerCase());
	}
	if (/^jobs(\.eu)?\.lever\.co$/.test(host) && (m = path.match(/^\/([^/]+)\/([0-9a-f-]{36})/i))) {
		return lever(m[1], m[2].toLowerCase(), host.includes('.eu.'));
	}
	if (/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(host) && (m = path.match(/^\/(?:[a-z]{2}-[A-Za-z]{2}\/)?([^/]+)\/job\/(.+)$/))) {
		return workday(url.origin, host.split('.')[0], m[1], m[2]);
	}
	return null;
}
