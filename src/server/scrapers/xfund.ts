import { atsDetail } from './ats';
import { fetchJson, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Xfund's board is a widget on www.xfund.com/jobs backed by a small app of
// its own (xfund-jobs.vercel.app) with a public search api: plain pages of
// json, at most 24 jobs each whatever perPage asks. The board has no job or
// company pages — the widget keeps its filters in the page url, so
// ?company=<slug> stands in for the company's page — and the api serves only
// a snippet of the description, so the full one is read from the posting's
// applicant tracking system where that is possible.

const BOARD = 'https://www.xfund.com/jobs';
const API = 'https://xfund-jobs.vercel.app/api/public/jobs';
const PER_PAGE = 24;
const MAX_PAGES = 200;

interface ApiJob {
	id?: string | null;
	title?: string | null;
	// a human-heading pair: department is the company's own wording, function
	// the api's slug taxonomy (data_and_ai, sales_and_business_development)
	department?: string | null;
	function?: string | null;
	location?: string | null;
	arrangement?: string | null;
	compensation?: {
		min?: number | null;
		max?: number | null;
		currency?: string | null;
		interval?: string | null;
	} | null;
	applyUrl?: string | null;
	postedAt?: string | null;
	company?: { name?: string | null; slug?: string | null } | null;
}

interface ApiResponse {
	jobs?: ApiJob[];
	totalPages?: number;
	total?: number;
}

// the function slugs as words: data_and_ai → "Data and AI"
const SLUG_WORDS: Record<string, string> = { and: 'and', ai: 'AI' };
const functionLabel = (slug: string) =>
	slug
		.split('_')
		.filter(Boolean)
		.map((w) => SLUG_WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

function toJob(j: ApiJob): ScrapedJob | null {
	const id = j.id ?? '';
	const slug = j.company?.slug ?? '';
	if (!id || !slug) return null;
	const companyUrl = `${BOARD}?company=${slug}`;
	const c = j.compensation;
	const salary =
		c && (c.min || c.max)
			? {
					min: c.min || null,
					max: c.max || null,
					currency: (c.currency ?? '').toUpperCase(),
					period: normalizePeriod(c.interval)
				}
			: null;
	const location = (j.location ?? '').trim();
	// the work mode once, unless the location already says it
	const arrangement = j.arrangement ?? '';
	const mode =
		/remote|hybrid/i.test(location) || !/^(remote|hybrid)$/.test(arrangement) ? '' : arrangement;
	const fn = j.function ?? '';
	return {
		key: id,
		company: j.company?.name ?? '',
		companyUrl,
		title: j.title ?? '',
		url: companyUrl,
		applyUrl: j.applyUrl ?? '',
		category: fn && fn !== 'unspecified' ? functionLabel(fn) : (j.department ?? ''),
		sector: '',
		location: [location, mode].filter(Boolean).join(' · '),
		salary,
		postedAt: j.postedAt ? new Date(j.postedAt) : null
	};
}

export const board: JobBoardScraper = {
	async list() {
		const byKey = new Map<string, ScrapedJob>();
		let total = 0;
		for (let page = 1; page <= MAX_PAGES; page++) {
			const data = await fetchJson<ApiResponse>(`${API}?page=${page}&perPage=${PER_PAGE}`, {
				headers: { accept: 'application/json' }
			});
			total ||= data.total ?? 0;
			for (const raw of data.jobs ?? []) {
				const job = toJob(raw);
				if (job) byKey.set(job.key, job);
			}
			if (!data.jobs?.length || page >= (data.totalPages ?? 0)) break;
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
