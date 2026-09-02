import { atsDetail } from './ats';
import { fetchJson, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Niceboard (first seen on Main Sequence's jobs.mseq.vc): a vue app over a
// json search api on the board's own host, fifty records a page. The records
// carry the description html along with the listing — though a board fed by
// imports from the portfolio's own tracking systems often leaves it empty,
// and the posting's system fills the gap at enrichment. One fetched listing
// is kept a few minutes per host, so an enrichment pass reads the board
// once, not once per job.

const PAGE_SIZE = 50;
const LIST_TTL_MS = 10 * 60_000;
const MAX_PAGES = 100;

interface NbJob {
	id: number;
	title?: string | null;
	slug?: string | null;
	company_name?: string | null;
	company_slug?: string | null;
	company?: { site_url?: string | null } | null;
	apply_url?: string | null;
	anonymity_enabled?: boolean | null;
	category?: { name?: string | null } | null;
	location_name?: string | null;
	is_remote?: boolean | null;
	salary_min?: number | null;
	salary_max?: number | null;
	salary_currency?: string | null;
	salary_timeframe?: string | null;
	show_salary?: boolean | null;
	published_at?: string | null;
	description_html?: string | null;
}

function fetchPage(host: string, page: number) {
	// the api validates the full filter set the board's own search sends
	const query = new URLSearchParams({
		jobtype: 'all',
		category: 'all',
		secondary_category: 'all',
		company: '',
		tags: '[]',
		city: '[]',
		state: '[]',
		country: '[]',
		remote_ok: 'false',
		remote_only: 'false',
		salary_timeframe: '',
		salary_min: '',
		salary_max: '',
		keyword: '',
		custom_fields: '{}',
		limit: String(PAGE_SIZE),
		page: String(page),
		sortby: 'date'
	});
	return fetchJson<{ count?: number; jobs?: NbJob[] }>(`https://${host}/api/jobs?${query}`, {
		headers: { accept: 'application/json' }
	});
}

async function listAll(host: string): Promise<Map<string, NbJob>> {
	const first = await fetchPage(host, 1);
	const count = first.count ?? 0;
	if (!count) throw new Error(`${host}: the board lists no jobs`);
	const byId = new Map<string, NbJob>();
	const add = (jobs?: NbJob[]) => {
		for (const j of jobs ?? []) if (j.id && !byId.has(String(j.id))) byId.set(String(j.id), j);
	};
	add(first.jobs);
	for (let page = 2; page <= Math.min(Math.ceil(count / PAGE_SIZE), MAX_PAGES); page++) {
		add((await fetchPage(host, page)).jobs);
	}
	// fail loudly rather than importing a partial list
	if (byId.size < count * 0.95) throw new Error(`${host}: collected ${byId.size} of ${count} jobs`);
	return byId;
}

const cached = new Map<string, { at: number; jobs: Promise<Map<string, NbJob>> }>();

function boardJobs(host: string): Promise<Map<string, NbJob>> {
	const entry = cached.get(host);
	if (entry && Date.now() - entry.at < LIST_TTL_MS) return entry.jobs;
	const fresh = { at: Date.now(), jobs: listAll(host) };
	cached.set(host, fresh);
	// a failed listing is not kept around
	fresh.jobs.catch(() => {
		if (cached.get(host) === fresh) cached.delete(host);
	});
	return fresh.jobs;
}

function toJob(host: string, j: NbJob): ScrapedJob {
	// the board's job page carries the company slug unless the company hides
	// its name
	const path = j.anonymity_enabled ? `${j.id}-${j.slug}` : `${j.id}-${j.slug}-${j.company_slug}`;
	const min = j.salary_min;
	const max = j.salary_max;
	const salary =
		j.show_salary && (min || max)
			? {
					min: min ?? null,
					max: max ?? null,
					currency: (j.salary_currency ?? '').toUpperCase(),
					period: normalizePeriod(j.salary_timeframe)
				}
			: null;
	const location = (j.location_name ?? '').trim();
	const remote = j.is_remote && !/remote/i.test(location) ? 'remote' : '';
	return {
		key: String(j.id),
		company: j.company_name ?? '',
		companyUrl: j.company?.site_url ?? '',
		title: j.title ?? '',
		url: `https://${host}/job/${path}`,
		applyUrl: j.apply_url ?? '',
		category: j.category?.name ?? '',
		sector: '',
		location: [location, remote].filter(Boolean).join(' · '),
		salary,
		postedAt: j.published_at ? new Date(j.published_at) : null
	};
}

export function niceboardBoard({ host }: { host: string }): JobBoardScraper {
	return {
		async list() {
			return [...(await boardJobs(host)).values()].map((j) => toJob(host, j));
		},

		async detail(job): Promise<ScrapedJobDetail | null> {
			const id = job.url.match(/\/job\/(\d+)-/)?.[1];
			const record = id ? (await boardJobs(host)).get(id) : undefined;
			const description = (record?.description_html ?? '').trim();
			if (description) return { description, category: record?.category?.name ?? undefined };
			// an imported posting keeps its description in the company's own
			// tracking system
			return job.applyUrl ? atsDetail(job.applyUrl) : null;
		}
	};
}
