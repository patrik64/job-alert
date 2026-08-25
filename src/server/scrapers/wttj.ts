import { fetchJson, fetchWithRetry, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Welcome to the Jungle (welcometothejungle.com) hosts company job boards;
// a fund's board is its company page there, the jobs posted by the fund
// itself (XAnge posts openings at its portfolio companies under its own
// name). The listing is an Algolia index and the detail a public api; both
// answer a plain request, while the site's own pages sit behind bot
// mitigation that turns everything but a real browser away — so the search
// credentials cannot be read from the page each run and are pinned here
// instead: the public client-side key embedded in every page of the site,
// locked to a referer saying the request comes from the site. Should it
// ever rotate, the listing fails loudly and the key is read anew from the
// page source in a browser. A job's page on the board is real; its apply
// link differs per job and only the detail api knows it, so the page
// stands in for both.

const SITE = 'https://www.welcometothejungle.com';
const API = 'https://api.welcometothejungle.com/api/v1';
const ALGOLIA_APP_ID = 'CSEKHVMS53';
const ALGOLIA_API_KEY = '4bd8f6215d0cc52b26430765769e65a0';
const ALGOLIA_INDEX_PREFIX = 'wttj_jobs_production';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

interface WttjHit {
	objectID?: string | null;
	name?: string | null;
	slug?: string | null;
	published_at?: string | null;
	contract_type?: string | null;
	// 'no' | 'partial' (hybrid) | 'fulltime' (remote)
	remote?: string | null;
	offices?: { city?: string | null; country?: string | null }[] | null;
	salary_minimum?: number | null;
	salary_maximum?: number | null;
	salary_currency?: string | null;
	salary_period?: string | null;
	// names are localized to the index's language; the reference is an
	// english slug with a five-character hash on the end
	new_profession?: { sub_category_reference?: string | null } | null;
	sectors?: { name?: string | null }[] | null;
	organization?: { name?: string | null } | null;
}

interface WttjSearch {
	hits?: WttjHit[];
	nbHits?: number;
	nbPages?: number;
}

interface WttjDetail {
	job?: {
		description?: string | null;
		profile?: string | null;
		recruitment_process?: string | null;
		published_at?: string | null;
		profession?: { name?: Record<string, string | null> | null } | null;
	} | null;
}

// accounting-5Nzg0 → Accounting, hr-generalist-hMjEw → HR Generalist
const WORDS: Record<string, string> = { hr: 'HR', it: 'IT', ai: 'AI', and: 'and' };
const professionLabel = (reference: string) =>
	reference
		.replace(/-\w{5}$/, '')
		.split('-')
		.filter(Boolean)
		.map((w) => WORDS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');

function toJob(orgSlug: string, companyUrl: string, h: WttjHit): ScrapedJob | null {
	const id = h.objectID ?? '';
	const slug = h.slug ?? '';
	if (!id || !slug) return null;
	const url = `${SITE}/en/companies/${orgSlug}/jobs/${slug}`;
	const salary =
		h.salary_minimum || h.salary_maximum
			? {
					min: h.salary_minimum || null,
					max: h.salary_maximum || null,
					currency: (h.salary_currency ?? '').toUpperCase(),
					period: normalizePeriod(h.salary_period)
				}
			: null;
	const offices = [
		...new Set(
			(h.offices ?? [])
				.map((o) => [o.city, o.country].filter(Boolean).join(', '))
				.filter(Boolean)
		)
	].join('; ');
	const mode = h.remote === 'fulltime' ? 'remote' : h.remote === 'partial' ? 'hybrid' : '';
	const reference = h.new_profession?.sub_category_reference ?? '';
	return {
		key: id,
		company: h.organization?.name ?? '',
		companyUrl,
		title: h.name ?? '',
		url,
		applyUrl: url,
		category: reference ? professionLabel(reference) : '',
		sector: (h.sectors ?? []).map((s) => (s.name ?? '').trim()).filter(Boolean).join(', '),
		location: [offices, mode].filter(Boolean).join(' · '),
		salary,
		postedAt: h.published_at ? new Date(h.published_at) : null
	};
}

export function wttjBoard({
	orgSlug,
	site = 'fr'
}: {
	orgSlug: string;
	// which country's index the organization publishes on
	site?: string;
}): JobBoardScraper {
	const companyUrl = `${SITE}/en/companies-v1/${orgSlug}/jobs`;
	const searchUrl = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX_PREFIX}_${site}/query`;
	return {
		async list() {
			const byKey = new Map<string, ScrapedJob>();
			let total = 0;
			for (let page = 0; page < MAX_PAGES; page++) {
				const data = await fetchJson<WttjSearch>(searchUrl, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						'x-algolia-application-id': ALGOLIA_APP_ID,
						'x-algolia-api-key': ALGOLIA_API_KEY,
						referer: `${SITE}/`
					},
					body: JSON.stringify({
						query: '',
						page,
						hitsPerPage: PAGE_SIZE,
						facetFilters: [[`organization.slug:${orgSlug}`]]
					})
				});
				total ||= data.nbHits ?? 0;
				for (const raw of data.hits ?? []) {
					const job = toJob(orgSlug, companyUrl, raw);
					if (job) byKey.set(job.key, job);
				}
				if (!data.hits?.length || page + 1 >= (data.nbPages ?? 0)) break;
			}
			if (byKey.size === 0) throw new Error(`${companyUrl}: the board lists no jobs`);
			// fail loudly rather than importing a partial list (see getro.ts)
			if (total && byKey.size < total * 0.95) {
				throw new Error(`${companyUrl}: collected ${byKey.size} of ${total} jobs`);
			}
			return [...byKey.values()];
		},

		async detail(job) {
			const m = job.url.match(/\/companies\/([^/]+)\/jobs\/([^/?#]+)/);
			if (!m) return null;
			const resp = await fetchWithRetry(`${API}/organizations/${m[1]}/jobs/${m[2]}`, {
				headers: { accept: 'application/json' }
			});
			if (resp.status === 404) return null;
			if (!resp.ok) throw new Error(`${job.url}: the detail api answered ${resp.status}`);
			const detail = ((await resp.json()) as WttjDetail).job;
			if (!detail) return null;
			// the board tells a job in three parts: the position, the profile
			// sought, and the recruitment process
			const description = [detail.description, detail.profile, detail.recruitment_process]
				.map((part) => (part ?? '').trim())
				.filter(Boolean)
				.join('\n');
			if (!description) return null;
			return {
				description,
				category: detail.profession?.name?.en ?? undefined,
				postedAt: detail.published_at ? new Date(detail.published_at) : undefined
			};
		}
	};
}
