import { fetchJson, fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Heavybit keeps its board in an algolia index whose config sits on the
// jobs page. The records carry the whole description as sanity
// portable-text blocks — megabytes a listing — so the list asks for the
// slim columns only and enrichment fetches one record at a time. There are
// no pages per job on the site: the links lead to the postings themselves.

const HOST = 'www.heavybit.com';
const PAGE_SIZE = 1000;
const CONFIG_TTL_MS = 10 * 60_000;

interface HbConfig {
	appId: string;
	key: string;
	index: string;
}

interface HbBlock {
	children?: { text?: string | null }[] | null;
}

interface HbHit {
	objectID?: string;
	title?: string | null;
	organization?: string | null;
	location?: string | null;
	applyLink?: string | null;
	tags?: (string | null)[] | null;
	content?: HbBlock[] | null;
}

let cached: { at: number; config: Promise<HbConfig> } | undefined;

async function readConfig(): Promise<HbConfig> {
	const resp = await fetchWithRetry(`https://${HOST}/jobs`);
	if (!resp.ok) throw new Error(`${HOST}: the jobs page answered ${resp.status}`);
	const html = await resp.text();
	const appId = html.match(/ALGOLIA_APPLICATION_ID":"([^"]+)"/)?.[1];
	const key = html.match(/ALGOLIA_SEARCH_API_KEY":"([^"]+)"/)?.[1];
	const index = html.match(/ALGOLIA_JOBS_INDEX":"([^"]+)"/)?.[1];
	if (!appId || !key || !index) throw new Error(`${HOST}: no algolia config on the page`);
	return { appId, key, index };
}

function config(): Promise<HbConfig> {
	if (!cached || Date.now() - cached.at > CONFIG_TTL_MS) {
		const fresh = { at: Date.now(), config: readConfig() };
		cached = fresh;
		// a failed read is not kept around
		fresh.config.catch(() => {
			if (cached === fresh) cached = undefined;
		});
	}
	return cached.config;
}

const headers = (c: HbConfig) => ({
	'X-Algolia-Application-Id': c.appId,
	'X-Algolia-API-Key': c.key,
	'content-type': 'application/json'
});

export const board: JobBoardScraper = {
	async list() {
		const c = await config();
		const page = (n: number) =>
			fetchJson<{ hits?: HbHit[]; nbHits?: number; nbPages?: number }>(
				`https://${c.appId}-dsn.algolia.net/1/indexes/${c.index}/query`,
				{
					method: 'POST',
					headers: headers(c),
					body: JSON.stringify({
						params:
							`hitsPerPage=${PAGE_SIZE}&page=${n}` +
							'&attributesToRetrieve=objectID,title,organization,location,applyLink,tags'
					})
				}
			);
		const first = await page(0);
		const count = first.nbHits ?? 0;
		if (!count) throw new Error(`${HOST}: the board lists no jobs`);
		const byKey = new Map<string, ScrapedJob>();
		const add = (hits?: HbHit[]) => {
			for (const h of hits ?? []) {
				if (!h.objectID || byKey.has(h.objectID)) continue;
				const apply = h.applyLink ?? '';
				byKey.set(h.objectID, {
					key: h.objectID,
					company: h.organization ?? '',
					companyUrl: '',
					title: h.title ?? '',
					url: apply,
					applyUrl: apply,
					category: (h.tags ?? []).filter(Boolean).join(', '),
					sector: '',
					location: h.location ?? '',
					salary: null,
					postedAt: null
				});
			}
		};
		add(first.hits);
		for (let n = 1; n < Math.min(first.nbPages ?? 1, 100); n++) add((await page(n)).hits);
		// fail loudly rather than importing a partial list
		if (byKey.size < count * 0.95) {
			throw new Error(`${HOST}: collected ${byKey.size} of ${count} jobs`);
		}
		return [...byKey.values()];
	},

	// the description is the record's portable text, one record a fetch —
	// flattened to its plain text, which is all the matching reads. The
	// record is addressed by the job's board key
	async detail(job): Promise<ScrapedJobDetail | null> {
		if (!job.key) throw new Error(`${HOST}: a detail fetch needs the job's key`);
		const c = await config();
		const resp = await fetchWithRetry(
			`https://${c.appId}-dsn.algolia.net/1/indexes/${c.index}/${encodeURIComponent(job.key)}?attributesToRetrieve=content`,
			{ headers: headers(c) }
		);
		if (resp.status === 404) return null;
		if (!resp.ok) throw new Error(`${HOST}: the job record answered ${resp.status}`);
		const record = (await resp.json()) as HbHit;
		const description = (record.content ?? [])
			.map((b) => (b.children ?? []).map((ch) => ch.text ?? '').join(''))
			.filter(Boolean)
			.join('\n\n');
		return { description };
	}
};
