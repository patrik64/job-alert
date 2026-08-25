import { atsDetail } from './ats';
import { fetchWithRetry, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Greylock left Consider (jobs.greylock.com now redirects here): the board
// is a next.js page on the fund's own site, sixty jobs a page. The rendered
// rows always show the first page whatever ?page= asks — the requested
// page's records ride along as json inside the server component payload, so
// they are read from there, balanced-bracket by balanced-bracket. A job's
// page on the board is real (?job=<id>) but renders its description only in
// the browser, so descriptions come from the posting's applicant tracking
// system, as with the Consider boards.

const BOARD = 'https://greylock.com/jobs/portfolio-jobs/';
const MAX_PAGES = 100;

interface GreylockJob {
	id?: string | null;
	title?: string | null;
	companyName?: string | null;
	companyDomain?: string | null;
	applyUrl?: string | null;
	createdAt?: string | null;
	functions?: string[] | null;
	locations?: string[] | null;
	normalizedLocations?: string[] | null;
	// 'remote' | 'hybrid' | 'onsite' | 'unknown'
	workMode?: string | null;
	salary?: {
		currency?: string | null;
		min?: number | null;
		max?: number | null;
		period?: string | null;
	} | null;
	markets?: string[] | null;
}

// the payload arrives as json-escaped string chunks pushed one by one
function decodePayload(html: string): string {
	const chunks = html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g);
	return [...chunks].map((m) => JSON.parse(`"${m[1]}"`) as string).join('');
}

// where the array opened at start closes, minding strings
function balancedEnd(s: string, start: number): number {
	let depth = 0;
	let inString = false;
	for (let i = start; i < s.length; i++) {
		const c = s[i];
		if (inString) {
			if (c === '\\') i++;
			else if (c === '"') inString = false;
		} else if (c === '"') inString = true;
		else if (c === '[' || c === '{') depth++;
		else if (c === ']' || c === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

// every "jobs" array in the payload — the requested page's records, and the
// first page's riding along as the pre-rendered fallback
function jobRecords(payload: string): GreylockJob[] {
	const records: GreylockJob[] = [];
	for (let i = payload.indexOf('"jobs":['); i >= 0; i = payload.indexOf('"jobs":[', i + 1)) {
		const start = i + '"jobs":'.length;
		const end = balancedEnd(payload, start);
		if (end < 0) continue;
		try {
			const parsed = JSON.parse(payload.slice(start, end + 1)) as unknown[];
			for (const r of parsed) {
				if (r && typeof r === 'object' && typeof (r as GreylockJob).id === 'string') {
					records.push(r as GreylockJob);
				}
			}
		} catch {
			// a component prop that only looked like the data
		}
	}
	return records;
}

function toJob(j: GreylockJob): ScrapedJob | null {
	const id = j.id ?? '';
	if (!id || !j.title) return null;
	const s = j.salary;
	const salary =
		s && (s.min || s.max)
			? {
					min: s.min || null,
					max: s.max || null,
					currency: (s.currency ?? '').toUpperCase(),
					period: normalizePeriod(s.period)
				}
			: null;
	const locations = [
		...new Set((j.normalizedLocations?.length ? j.normalizedLocations : (j.locations ?? [])).map((l) => l.trim()).filter(Boolean))
	].join('; ');
	const mode =
		/remote|hybrid/i.test(locations) || !/^(remote|hybrid)$/.test(j.workMode ?? '')
			? ''
			: (j.workMode as string);
	return {
		key: id,
		company: j.companyName ?? '',
		companyUrl: j.companyDomain ? `https://${j.companyDomain}` : BOARD,
		title: j.title,
		url: `${BOARD}?job=${id}`,
		applyUrl: j.applyUrl ?? '',
		category: (j.functions ?? []).join(', '),
		sector: (j.markets ?? []).join(', '),
		location: [locations, mode].filter(Boolean).join(' · '),
		salary,
		postedAt: j.createdAt ? new Date(j.createdAt) : null
	};
}

export const board: JobBoardScraper = {
	async list() {
		const byKey = new Map<string, ScrapedJob>();
		let total = 0;
		for (let page = 1; page <= MAX_PAGES; page++) {
			const resp = await fetchWithRetry(`${BOARD}?page=${page}`);
			if (!resp.ok) throw new Error(`${BOARD}: page ${page} answered ${resp.status}`);
			const payload = decodePayload(await resp.text());
			total ||= Number(payload.match(/"totalCount":(\d+)/)?.[1] ?? 0);
			let fresh = 0;
			for (const raw of jobRecords(payload)) {
				const job = toJob(raw);
				if (job && !byKey.has(job.key)) {
					byKey.set(job.key, job);
					fresh++;
				}
			}
			if (!fresh || (total && byKey.size >= total)) break;
		}
		if (byKey.size === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		// fail loudly rather than importing a partial list (see getro.ts)
		if (total && byKey.size < total * 0.95) {
			throw new Error(`${BOARD}: collected ${byKey.size} of ${total} jobs`);
		}
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
