import { atsDetail } from './ats';
import { fetchWithRetry, normalizePeriod, sleep } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Consider (consider.com) powers job boards such as jobs.gv.com: a single-page
// app over a search api on the board's own domain. The api wants the session
// cookie and the csrf token the page hands out, both from the same response;
// pages are cursor-based and hold up to a thousand jobs each. The board has
// no job pages of its own — its cards link straight to the posting — so the
// company's page on the board stands in for the job's, and the description
// is read from the posting's applicant tracking system where that is possible.
// A board without a domain of its own lives under a path on consider.com
// (consider.com/boards/vc/<slug>); the api is at the host's root either way.

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

interface Labeled {
	label?: string | null;
	name?: string | null;
	value?: string | null;
}

interface SearchJob {
	jobId?: string | null;
	title?: string | null;
	applyUrl?: string | null;
	url?: string | null;
	companyName?: string | null;
	companySlug?: string | null;
	timeStamp?: string | null;
	locations?: (string | Labeled)[] | null;
	remote?: boolean | null;
	hybrid?: boolean | null;
	salary?: {
		minValue?: number | null;
		maxValue?: number | null;
		currency?: Labeled | null;
		period?: Labeled | null;
		// false = the platform's own estimate, not what the company posted
		isOriginal?: boolean | null;
	} | null;
	jobFunctions?: Labeled[] | null;
	departments?: string[] | null;
	markets?: Labeled[] | null;
}

interface SearchResponse {
	jobs?: SearchJob[];
	meta?: { sequence?: string | null };
	total?: number;
}

interface Session {
	cookie: string;
	csrfToken: string;
}

async function handshake(base: string): Promise<Session> {
	// the page occasionally answers 200 without the token (seen on
	// careers.ivp.com) — a fresh request straightens that out, which the
	// status-driven retry in fetchWithRetry never attempts
	for (let attempt = 1; ; attempt++) {
		const resp = await fetchWithRetry(`${base}/jobs`);
		if (!resp.ok) throw new Error(`${base}: the jobs page answered ${resp.status}`);
		// the api checks a double-submit pair: the secret in the session cookie
		// and the matching token embedded in the page
		const cookie = resp.headers
			.getSetCookie()
			.map((c) => c.split(';')[0])
			.filter(Boolean)
			.join('; ');
		const csrfToken = (await resp.text()).match(/"csrfToken":"([^"]+)"/)?.[1];
		if (cookie && csrfToken) return { cookie, csrfToken };
		if (attempt === 3) throw new Error(`${base}: could not read the board's csrf token`);
		await sleep(2000 * attempt);
	}
}

const label = (x: string | Labeled | null | undefined) =>
	(typeof x === 'string' ? x : (x?.label ?? x?.name ?? x?.value ?? '')).trim();

function toJob(base: string, j: SearchJob): ScrapedJob | null {
	const companySlug = j.companySlug ?? '';
	const jobId = j.jobId ?? '';
	if (!companySlug || !jobId) return null;
	const companyUrl = `${base}/jobs/${companySlug}`;
	const s = j.salary;
	const salary =
		s && s.isOriginal && (s.minValue || s.maxValue)
			? {
					min: s.minValue || null,
					max: s.maxValue || null,
					currency: label(s.currency).toUpperCase(),
					period: normalizePeriod(label(s.period))
				}
			: null;
	const functions = (j.jobFunctions ?? []).map(label).filter(Boolean);
	const departments = (j.departments ?? []).map((d) => d.trim()).filter(Boolean);
	// the board repeats a location in several spellings, some of them verbatim
	const locations = [...new Set((j.locations ?? []).map(label).filter(Boolean))].join('; ');
	// the work mode is said once, even when the locations already say it
	const mode = /remote|hybrid/i.test(locations) ? '' : j.remote ? 'remote' : j.hybrid ? 'hybrid' : '';
	return {
		key: `${companySlug}/${jobId}`,
		company: j.companyName ?? '',
		companyUrl,
		title: j.title ?? '',
		url: companyUrl,
		applyUrl: j.applyUrl ?? j.url ?? '',
		category: (functions.length ? functions : departments).join(', '),
		sector: (j.markets ?? []).map(label).filter(Boolean).join(', '),
		location: [locations, mode].filter(Boolean).join(' · '),
		salary,
		postedAt: j.timeStamp ? new Date(j.timeStamp) : null
	};
}

export function considerBoard({
	host,
	boardId,
	path = ''
}: {
	host: string;
	boardId: string;
	path?: string;
}): JobBoardScraper {
	// the board's pages (the handshake, the company pages) live under the
	// path; the api does not
	const base = `https://${host}${path}`;
	const api = `https://${host}/api-boards/search-jobs`;
	return {
		async list() {
			let session = await handshake(base);
			const byKey = new Map<string, ScrapedJob>();
			let total = 0;
			let sequence: string | undefined;
			let renewed = false;
			for (let page = 0; page < MAX_PAGES; page++) {
				const resp = await fetchWithRetry(api, {
					method: 'POST',
					headers: {
						accept: 'application/json',
						'content-type': 'application/json',
						'x-csrf-token': session.csrfToken,
						cookie: session.cookie
					},
					body: JSON.stringify({
						meta: { size: PAGE_SIZE, ...(sequence ? { sequence } : {}) },
						board: { id: boardId, isParent: true },
						query: {}
					})
				});
				if (resp.status === 412 && !renewed) {
					// the session lapsed mid-run: shake hands again, once
					renewed = true;
					session = await handshake(base);
					page--;
					continue;
				}
				if (!resp.ok) throw new Error(`${base}: the search answered ${resp.status}`);
				const data = (await resp.json()) as SearchResponse;
				total ||= data.total ?? 0;
				let fresh = 0;
				for (const raw of data.jobs ?? []) {
					const job = toJob(base, raw);
					if (job && !byKey.has(job.key)) {
						byKey.set(job.key, job);
						fresh++;
					}
				}
				sequence = data.meta?.sequence ?? undefined;
				if (!fresh || !sequence || (total && byKey.size >= total)) break;
			}
			if (byKey.size === 0) throw new Error(`${base}: the board lists no jobs`);
			// fail loudly rather than importing a partial list (see getro.ts)
			if (total && byKey.size < total * 0.95) {
				throw new Error(`${base}: collected ${byKey.size} of ${total} jobs`);
			}
			return [...byKey.values()];
		},

		detail(job) {
			return atsDetail(job.applyUrl);
		}
	};
}
