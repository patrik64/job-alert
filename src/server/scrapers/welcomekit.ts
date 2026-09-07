import { fetchJson, fetchWithRetry } from './http';
import { normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Welcomekit — welcome to the jungle's hosted portfolio boards (first seen
// on isai.welcomekit.co). The board's page carries a scoped algolia key,
// locked by the platform to the board's own jobs, and the jobs sit in one
// shared algolia index served a thousand hits a page. Every job has a page
// of its own on the board, carrying a schema.org JobPosting whose
// description feeds enrichment.

const PAGE_SIZE = 1000;

interface WkOffice {
	city?: string | null;
	country?: string | null;
}

interface WkHit {
	objectID?: number | string;
	name?: string | null;
	slug?: string | null;
	organization?: { name?: string | null; slug?: string | null } | null;
	offices?: WkOffice[] | null;
	remote?: string | null;
	profession?: {
		name?: Record<string, string | null> | null;
		category?: Record<string, string | null> | null;
	} | null;
	sectors_name?: Record<string, Record<string, string | null>[]> | null;
	salary_minimum?: number | null;
	salary_maximum?: number | null;
	salary_currency?: string | null;
	salary_period?: string | null;
	published_at?: string | null;
}

interface WkPage {
	hits?: WkHit[];
	nbHits?: number;
	nbPages?: number;
}

async function boardConfig(host: string) {
	const resp = await fetchWithRetry(`https://${host}/`);
	if (!resp.ok) throw new Error(`${host}: the board answered ${resp.status}`);
	const html = await resp.text();
	const key = html.match(/id=['"]algolia_api_key['"] value=['"]([^'"]+)['"]/)?.[1];
	const appId = html.match(/algoliaAppId:\s*['"]([^'"]+)['"]/)?.[1];
	const suffix = html.match(/algoliaIndexSuffix:\s*['"]([^'"]+)['"]/)?.[1];
	if (!key || !appId || !suffix) throw new Error(`${host}: no algolia config on the page`);
	return { key, appId, index: `wk_cms_jobs_${suffix}` };
}

function toJob(host: string, h: WkHit): ScrapedJob | null {
	const orgSlug = h.organization?.slug ?? '';
	if (!h.objectID || !h.slug || !orgSlug) return null;
	const url = `https://${host}/companies/${orgSlug}/jobs/${h.slug}`;
	const places = [
		...new Set(
			(h.offices ?? [])
				.map((o) => [o.city, o.country].filter(Boolean).join(', '))
				.filter(Boolean)
		)
	].join('; ');
	// the platform's remote wording: fulltime means fully remote, partial a
	// hybrid arrangement
	const mode =
		h.remote === 'fulltime' && !/remote/i.test(places)
			? 'remote'
			: h.remote === 'partial' && !/hybrid/i.test(places)
				? 'hybrid'
				: '';
	const min = h.salary_minimum;
	const max = h.salary_maximum;
	return {
		key: String(h.objectID),
		company: h.organization?.name ?? '',
		companyUrl: `https://${host}/companies/${orgSlug}`,
		title: h.name ?? '',
		url,
		applyUrl: url,
		category: h.profession?.name?.en ?? h.profession?.category?.en ?? '',
		sector: [
			...new Set((h.sectors_name?.en ?? []).flatMap((s) => Object.values(s)).filter(Boolean))
		].join(', ') as string,
		location: [places, mode].filter(Boolean).join(' · '),
		salary:
			min || max
				? {
						min: min ?? null,
						max: max ?? null,
						currency: (h.salary_currency ?? '').toUpperCase(),
						period: normalizePeriod(h.salary_period)
					}
				: null,
		postedAt: h.published_at ? new Date(h.published_at) : null
	};
}

export function welcomekitBoard({ host }: { host: string }): JobBoardScraper {
	return {
		async list() {
			const { key, appId, index } = await boardConfig(host);
			const page = (n: number) =>
				fetchJson<WkPage>(`https://${appId}-dsn.algolia.net/1/indexes/${index}/query`, {
					method: 'POST',
					headers: {
						'X-Algolia-Application-Id': appId,
						'X-Algolia-API-Key': key,
						'content-type': 'application/json'
					},
					body: JSON.stringify({ params: `hitsPerPage=${PAGE_SIZE}&page=${n}` })
				});
			const first = await page(0);
			const count = first.nbHits ?? 0;
			if (!count) throw new Error(`${host}: the board lists no jobs`);
			const byKey = new Map<string, ScrapedJob>();
			const add = (hits?: WkHit[]) => {
				for (const h of hits ?? []) {
					const job = toJob(host, h);
					if (job && !byKey.has(job.key)) byKey.set(job.key, job);
				}
			};
			add(first.hits);
			for (let n = 1; n < Math.min(first.nbPages ?? 1, 100); n++) add((await page(n)).hits);
			// fail loudly rather than importing a partial list
			if (byKey.size < count * 0.95) {
				throw new Error(`${host}: collected ${byKey.size} of ${count} jobs`);
			}
			return [...byKey.values()];
		},

		async detail(job): Promise<ScrapedJobDetail | null> {
			const resp = await fetchWithRetry(job.url);
			if (resp.status === 404) return null;
			if (!resp.ok) throw new Error(`${host}: the job page answered ${resp.status}`);
			const html = await resp.text();
			// the description travels in the page's schema.org JobPosting; its
			// strings hold raw control characters no strict parser accepts
			for (const m of html.matchAll(/<script[^>]*>\s*(\{\s*"@context"[\s\S]*?)<\/script>/g)) {
				const posting = JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, ' ')) as {
					'@type'?: string;
					description?: string;
				};
				if (posting['@type'] === 'JobPosting') {
					return { description: posting.description ?? '' };
				}
			}
			return null;
		}
	};
}
