import { fetchJson, fetchWithRetry, mapConcurrent } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Founders Factory's startup jobs — a gatsby page whose list of portfolio
// companies comes from airtable at build time, each company with its
// smartrecruiters id; the browser then asks smartrecruiters' public api for
// each company's postings. The scraper does the same. The company list is
// the page's static query over the "Master Companies" table — its hash
// follows the query, so it is looked up among the page's own — and the
// postings are read company by company. A posting's description comes from
// the same api, one posting at a time.

const SITE = 'https://foundersfactory.com';
const PAGE_DATA = `${SITE}/page-data/startup-jobs/page-data.json`;
const SR = 'https://api.smartrecruiters.com/v1/companies';
const PAGE_SIZE = 100;
const CONCURRENCY = 6;

interface Company {
	name: string;
	srId: string;
}

interface Posting {
	id?: string | null;
	name?: string | null;
	releasedDate?: string | null;
	function?: { label?: string | null } | null;
	location?: { fullLocation?: string | null; remote?: boolean | null; hybrid?: boolean | null } | null;
}

interface PostingDetail {
	jobAd?: { sections?: Record<string, { title?: string | null; text?: string | null }> } | null;
}

async function companies(): Promise<Company[]> {
	const page = await fetchJson<{ staticQueryHashes?: string[] }>(PAGE_DATA);
	for (const hash of page.staticQueryHashes ?? []) {
		const resp = await fetchWithRetry(`${SITE}/page-data/sq/d/${hash}.json`);
		if (!resp.ok) continue;
		const text = await resp.text();
		if (!text.includes('"Master Companies"')) continue;
		const data = JSON.parse(text) as {
			data?: { records?: { nodes?: { content?: { name?: string; srId?: string } }[] } };
		};
		return (data.data?.records?.nodes ?? []).flatMap(({ content }) =>
			content?.name && content.srId ? [{ name: content.name.trim(), srId: content.srId.trim() }] : []
		);
	}
	throw new Error(`${PAGE_DATA}: no company list among the page's queries`);
}

async function postings(srId: string): Promise<Posting[]> {
	const all: Posting[] = [];
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const page = await fetchJson<{ totalFound?: number; content?: Posting[] }>(
			`${SR}/${encodeURIComponent(srId)}/postings?limit=${PAGE_SIZE}&offset=${offset}`
		);
		all.push(...(page.content ?? []));
		if ((page.content ?? []).length < PAGE_SIZE || all.length >= (page.totalFound ?? 0)) return all;
	}
}

export const board: JobBoardScraper = {
	async list() {
		const list = await companies();
		const perCompany = await mapConcurrent(list, CONCURRENCY, async (c) => ({
			company: c,
			postings: await postings(c.srId)
		}));
		const byKey = new Map<string, ScrapedJob>();
		for (const { company, postings } of perCompany) {
			for (const p of postings) {
				const title = (p.name ?? '').trim();
				if (!p.id || !title || byKey.has(p.id)) continue;
				const url = `https://jobs.smartrecruiters.com/${company.srId}/${p.id}`;
				const mode = p.location?.remote ? 'remote' : p.location?.hybrid ? 'hybrid' : '';
				byKey.set(p.id, {
					key: p.id,
					company: company.name,
					companyUrl: '',
					title,
					url,
					applyUrl: url,
					category: p.function?.label ?? '',
					sector: '',
					location: [p.location?.fullLocation ?? '', mode].filter(Boolean).join(' · '),
					salary: null,
					postedAt: p.releasedDate ? new Date(p.releasedDate) : null
				});
			}
		}
		// a portfolio this size has open roles somewhere; none at all means
		// the reading broke rather than that every company stopped hiring
		if (byKey.size === 0) throw new Error(`${SITE}: no postings across ${list.length} companies`);
		return [...byKey.values()];
	},

	async detail(job): Promise<ScrapedJobDetail | null> {
		const m = job.applyUrl.match(/jobs\.smartrecruiters\.com\/([^/]+)\/(\d+)/);
		if (!m) return null;
		const resp = await fetchWithRetry(`${SR}/${encodeURIComponent(m[1])}/postings/${m[2]}`);
		if (resp.status === 404) return null;
		if (!resp.ok) throw new Error(`${job.applyUrl}: the posting answered ${resp.status}`);
		const sections = ((await resp.json()) as PostingDetail).jobAd?.sections ?? {};
		const description = Object.values(sections)
			.filter((s) => s.text?.trim())
			.map((s) => (s.title ? `<h3>${s.title}</h3>${s.text}` : (s.text as string)))
			.join('\n');
		return description ? { description } : null;
	}
};
