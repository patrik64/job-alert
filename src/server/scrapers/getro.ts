import { atsDetail } from './ats';
import { fetchJson, fetchWithRetry, mapConcurrent, normalizePeriod, pacer } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Getro powers many vc job boards (jobs.<fund>.com): a next.js front-end over
// a public search api. The list api needs no key, but serves 20 jobs a page
// and never carries the description or the job functions — those sit only in
// the job page's next.js data, which is addressed by the deployment's build id.

const API = 'https://api.getro.com/api/v2/collections';
const PAGE_SIZE = 20;
const LIST_CONCURRENCY = 4;
const JSON_HEADERS = { accept: 'application/json', 'content-type': 'application/json' };
// the search api rate-limits bursts of a few hundred requests a minute; all
// boards share one pace towards it, a little under eight requests a second
const paceSearch = pacer(130);

interface ListJob {
	id: number;
	slug: string;
	title?: string | null;
	url?: string | null;
	created_at?: number | null;
	work_mode?: string | null;
	locations?: string[] | null;
	compensation_public?: boolean | null;
	compensation_amount_min_cents?: number | null;
	compensation_amount_max_cents?: number | null;
	compensation_currency?: string | null;
	compensation_period?: string | null;
	organization?: {
		name?: string | null;
		slug?: string | null;
		industry_tags?: string[] | null;
	} | null;
}

interface ListResponse {
	results?: { count?: number; jobs?: ListJob[] };
}

interface DetailResponse {
	pageProps?: {
		initialState?: {
			jobs?: {
				currentJob?: {
					description?: string | null;
					jobFunctions?: { name?: string | null }[] | null;
					postedAt?: string | null;
				} | null;
			};
		};
	};
}

// the build id is read from the board's html and cached per host. A stale one
// (the board redeployed) answers 404 and is read again — unless it was read
// moments ago, in which case a 404 means the job itself is gone
interface BuildIdEntry {
	id: Promise<string>;
	readAt: number;
}
const buildIds = new Map<string, BuildIdEntry>();
const TRUST_MS = 60_000;

async function readBuildId(host: string): Promise<string> {
	const resp = await fetchWithRetry(`https://${host}/jobs`);
	if (!resp.ok) throw new Error(`${host}: the jobs page answered ${resp.status}`);
	const id = (await resp.text()).match(/"buildId":"([^"]+)"/)?.[1];
	if (!id) throw new Error(`${host}: no next.js build id on the jobs page`);
	return id;
}

function buildIdOf(host: string): Promise<string> {
	let entry = buildIds.get(host);
	if (!entry) {
		entry = { id: readBuildId(host), readAt: Date.now() };
		buildIds.set(host, entry);
		// a failed read is not kept around
		entry.id.catch(() => buildIds.delete(host));
	}
	return entry.id;
}

async function refreshBuildId(host: string, stale: string): Promise<string> {
	const entry = buildIds.get(host);
	if (entry) {
		const id = await entry.id.catch(() => stale);
		if (id !== stale || Date.now() - entry.readAt < TRUST_MS) return id;
		// several concurrent 404s trigger one re-read: whoever gets here first
		// drops the entry, the rest find the fresh one already in place
		if (buildIds.get(host) === entry) buildIds.delete(host);
	}
	return buildIdOf(host);
}

function toJob(host: string, j: ListJob): ScrapedJob | null {
	const org = j.organization ?? {};
	const orgSlug = org.slug ?? '';
	if (!j.id || !j.slug || !orgSlug) return null;
	const min = j.compensation_amount_min_cents;
	const max = j.compensation_amount_max_cents;
	const salary =
		j.compensation_public && (min || max)
			? {
					min: min ? min / 100 : null,
					max: max ? max / 100 : null,
					currency: (j.compensation_currency ?? '').toUpperCase(),
					period: normalizePeriod(j.compensation_period)
				}
			: null;
	const locations = [...new Set((j.locations ?? []).filter(Boolean))].join('; ');
	// boards often list "Remote" among the locations as well as flagging the
	// work mode; say it once
	const remote = j.work_mode === 'remote' && !/remote/i.test(locations) ? 'remote' : '';
	return {
		key: String(j.id),
		company: org.name ?? '',
		companyUrl: `https://${host}/companies/${orgSlug}`,
		title: j.title ?? '',
		url: `https://${host}/companies/${orgSlug}/jobs/${j.slug}`,
		applyUrl: j.url ?? '',
		// the job functions travel with the detail only
		category: '',
		sector: (org.industry_tags ?? []).filter(Boolean).join(', '),
		location: [locations, remote].filter(Boolean).join(' · '),
		salary,
		postedAt: j.created_at ? new Date(j.created_at * 1000) : null
	};
}

export function getroBoard({
	host,
	collectionId
}: {
	host: string;
	collectionId: number;
}): JobBoardScraper {
	const searchUrl = `${API}/${collectionId}/search/jobs`;
	const page = async (n: number) => {
		await paceSearch();
		return fetchJson<ListResponse>(searchUrl, {
			method: 'POST',
			headers: JSON_HEADERS,
			body: JSON.stringify({ page: n })
		});
	};

	return {
		async list() {
			const first = await page(0);
			const count = first.results?.count ?? 0;
			if (!count) throw new Error(`${host}: the board lists no jobs`);
			const pages = Math.ceil(count / PAGE_SIZE);
			const rest = await mapConcurrent(
				Array.from({ length: pages - 1 }, (_, i) => i + 1),
				LIST_CONCURRENCY,
				(n) => page(n)
			);

			// the list shifts while it is being paged (new jobs land on top), so
			// a job can show up twice and another slip between two pages
			const byKey = new Map<string, ScrapedJob>();
			for (const resp of [first, ...rest]) {
				for (const raw of resp.results?.jobs ?? []) {
					const job = toJob(host, raw);
					if (job && !byKey.has(job.key)) byKey.set(job.key, job);
				}
			}
			// fail loudly rather than importing a partial list: the jobs missed
			// now would be marked closed, only to reappear as newcomers later
			if (byKey.size < count * 0.95) {
				throw new Error(`${host}: collected ${byKey.size} of ${count} jobs`);
			}
			return [...byKey.values()];
		},

		async detail(job) {
			const m = job.url.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/);
			if (!m) throw new Error(`${host}: not a board job url: ${job.url}`);
			const [, orgSlug, jobSlug] = m;
			const fetchData = (buildId: string) =>
				fetchWithRetry(
					`https://${host}/_next/data/${buildId}/companies/${orgSlug}/jobs/${jobSlug}.json`,
					{ headers: { accept: 'application/json', 'x-nextjs-data': '1' } }
				);

			const buildId = await buildIdOf(host);
			let resp = await fetchData(buildId);
			if (resp.status === 404) {
				// either the board redeployed (stale build id) or the job is gone
				const fresh = await refreshBuildId(host, buildId);
				if (fresh !== buildId) resp = await fetchData(fresh);
				if (resp.status === 404) return null;
			}
			if (!resp.ok) throw new Error(`${host}: the job data answered ${resp.status}`);
			const data = (await resp.json()) as DetailResponse;
			const current = data.pageProps?.initialState?.jobs?.currentJob;
			if (!current) return null;
			// a board page without a description may still lead to a posting
			// whose tracking system publishes one
			let description = current.description ?? '';
			if (!description.trim() && job.applyUrl) {
				description = (await atsDetail(job.applyUrl))?.description ?? '';
			}
			return {
				description,
				category: (current.jobFunctions ?? [])
					.map((f) => (f.name ?? '').trim())
					.filter(Boolean)
					.join(', '),
				postedAt: current.postedAt ? new Date(current.postedAt) : null
			};
		}
	};
}
