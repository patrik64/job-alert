import { fetchJson } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// imec's job opportunities — the research institute hiring for itself, not a
// fund's portfolio: student projects, phds and postdocs beside staff roles.
// The careers page is a next.js site over drupal, and its job list is an
// algolia search the browser runs against the "imecint_jobs" index with the
// site's public search-only key: each opening with its title, a tagline
// "<category> - <place>", the page on imec's site, the day and the full
// description. One query reads every opening; the descriptions are served
// from a short-lived copy of it. Should the key ever change, the query fails
// with 403 and the key is read off the site's search script again by hand.

const SITE = 'https://www.imec-int.com';
const APP_ID = 'MDI2HZC2VI';
const SEARCH_KEY = 'd7b948703af6b3ec8f92bad893eee8aa';
const INDEX = 'imecint_jobs';
const PAGE_SIZE = 1000;
const LIST_TTL_MS = 10 * 60_000;

interface Hit {
	objectID?: string;
	title?: string | null;
	tagline?: string | null;
	url?: string | null;
	date?: string | null;
	description?: string | null;
}

async function search(): Promise<Hit[]> {
	const hits: Hit[] = [];
	for (let page = 0; ; page++) {
		const data = await fetchJson<{ hits?: Hit[]; nbPages?: number }>(
			`https://${APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query`,
			{
				method: 'POST',
				headers: {
					'x-algolia-application-id': APP_ID,
					'x-algolia-api-key': SEARCH_KEY,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ params: `hitsPerPage=${PAGE_SIZE}&page=${page}` })
			}
		);
		hits.push(...(data.hits ?? []));
		if (page + 1 >= (data.nbPages ?? 1)) return hits;
	}
}

let listed: { hits: Promise<Hit[]>; readAt: number } | undefined;

function readHits(): Promise<Hit[]> {
	if (listed && Date.now() - listed.readAt < LIST_TTL_MS) return listed.hits;
	const hits = search();
	listed = { hits, readAt: Date.now() };
	// a failed read is not kept
	hits.catch(() => (listed = undefined));
	return hits;
}

const pageOf = (path: string) => (/^https?:\/\//.test(path) ? path : `${SITE}${path}`);

export const board: JobBoardScraper = {
	async list() {
		const byKey = new Map<string, ScrapedJob>();
		for (const hit of await readHits()) {
			const title = (hit.title ?? '').trim();
			if (!hit.objectID || !title || !hit.url || byKey.has(hit.objectID)) continue;
			// "Research & development - Eindhoven"
			const tagline = (hit.tagline ?? '').trim();
			const cut = tagline.lastIndexOf(' - ');
			const url = pageOf(hit.url);
			byKey.set(hit.objectID, {
				key: hit.objectID,
				company: 'imec',
				companyUrl: SITE,
				title,
				url,
				applyUrl: url,
				category: cut >= 0 ? tagline.slice(0, cut).trim() : tagline,
				sector: '',
				location: cut >= 0 ? tagline.slice(cut + 3).trim() : '',
				salary: null,
				// "2026-10-14 14:00:00", belgian time; the day is what counts
				postedAt: hit.date ? new Date(`${hit.date.replace(' ', 'T')}Z`) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${SITE}: the job search returned nothing`);
		return [...byKey.values()];
	},

	async detail(job) {
		const hit = (await readHits()).find((h) => h.url && pageOf(h.url) === job.url);
		const description = hit?.description?.trim();
		return description ? { description } : null;
	}
};
