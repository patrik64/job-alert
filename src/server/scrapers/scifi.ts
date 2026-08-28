import { atsDetail } from './ats';
import { fetchJson, fetchWithRetry, mapConcurrent } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// SciFi's site (an astro build) keeps its portfolio inside the jobs widget's
// script: each company with its website, its sector and — where the company
// hires through a known applicant tracking system — the ats and board token,
// and the browser asks the ats apis for the openings directly. The scraper
// does the same. The script's name is hashed anew per deploy, so it is found
// on the homepage first; jobs are then keyed by board token and the
// posting's id there. The site has no pages per job or company, so the
// links lead to the postings themselves.

const SITE = 'https://scifi.vc/';

interface Company {
	name: string;
	website: string;
	sector: string;
	ats: 'greenhouse' | 'ashby' | 'lever';
	token: string;
}

async function fetchCompanies(): Promise<Company[]> {
	const page = await fetchWithRetry(SITE);
	if (!page.ok) throw new Error(`${SITE}: the page answered ${page.status}`);
	const script = (await page.text()).match(/\/_astro\/Jobs\.astro[\w.-]*\.js/)?.[0];
	if (!script) throw new Error(`${SITE}: the page names no jobs script`);
	const resp = await fetchWithRetry(new URL(script, SITE).href);
	if (!resp.ok) throw new Error(`${SITE}: the jobs script answered ${resp.status}`);
	const js = await resp.text();
	// the portfolio is a js array literal; each company's fields sit between
	// its name and the next company's
	const anchors = [...js.matchAll(/\{name:"((?:[^"\\]|\\.)*)"/g)];
	const companies: Company[] = [];
	for (const [i, m] of anchors.entries()) {
		const entry = js.slice(m.index, anchors[i + 1]?.index ?? js.length);
		const ats = entry.match(
			/ats:\{type:"(greenhouse|ashby|lever)",token:"((?:[^"\\]|\\.)*)"\}/
		);
		if (!ats) continue;
		companies.push({
			name: JSON.parse(`"${m[1]}"`),
			website: entry.match(/website:"((?:[^"\\]|\\.)*)"/)?.[1] ?? '',
			sector: entry.match(/category:"((?:[^"\\]|\\.)*)"/)?.[1] ?? '',
			ats: ats[1] as Company['ats'],
			token: JSON.parse(`"${ats[2]}"`)
		});
	}
	if (companies.length === 0) throw new Error(`${SITE}: the script names no ats boards`);
	return companies;
}

const job = (c: Company, key: string, url: string): ScrapedJob => ({
	key: `${c.token}/${key}`,
	company: c.name,
	companyUrl: c.website,
	title: '',
	url,
	applyUrl: url,
	category: '',
	sector: c.sector,
	location: '',
	salary: null,
	postedAt: null
});

interface GreenhouseJob {
	id?: number;
	title?: string | null;
	absolute_url?: string | null;
	location?: { name?: string | null } | null;
}

async function greenhouse(c: Company): Promise<ScrapedJob[]> {
	const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(
		`https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs`,
		{ headers: { accept: 'application/json' } }
	);
	return (data.jobs ?? [])
		.filter((j) => j.id)
		.map((j) => ({
			...job(c, String(j.id), j.absolute_url ?? ''),
			title: j.title ?? '',
			location: (j.location?.name ?? '').trim()
		}));
}

interface AshbyJob {
	id?: string;
	title?: string | null;
	jobUrl?: string | null;
	location?: string | null;
	secondaryLocations?: { location?: string | null }[] | null;
	isRemote?: boolean | null;
	department?: string | null;
	team?: string | null;
	publishedAt?: string | null;
	isListed?: boolean | null;
}

async function ashby(c: Company): Promise<ScrapedJob[]> {
	const data = await fetchJson<{ jobs?: AshbyJob[] }>(
		`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}`,
		{ headers: { accept: 'application/json' } }
	);
	return (data.jobs ?? [])
		.filter((j) => j.id && j.isListed !== false)
		.map((j) => {
			const places = [j.location ?? '', ...(j.secondaryLocations ?? []).map((l) => l.location ?? '')];
			const locations = [...new Set(places.map((p) => p.trim()).filter(Boolean))].join('; ');
			const mode = j.isRemote && !/remote/i.test(locations) ? 'remote' : '';
			return {
				...job(c, j.id!, j.jobUrl ?? ''),
				title: j.title ?? '',
				category: (j.department ?? j.team ?? '').trim(),
				location: [locations, mode].filter(Boolean).join(' · '),
				postedAt: j.publishedAt ? new Date(j.publishedAt) : null
			};
		});
}

interface LeverJob {
	id?: string;
	text?: string | null;
	hostedUrl?: string | null;
	categories?: { location?: string | null; team?: string | null } | null;
	createdAt?: number | null;
}

async function lever(c: Company): Promise<ScrapedJob[]> {
	const postings = await fetchJson<LeverJob[]>(
		`https://api.lever.co/v0/postings/${c.token}?mode=json`,
		{ headers: { accept: 'application/json' } }
	);
	return (postings ?? [])
		.filter((j) => j.id)
		.map((j) => ({
			...job(c, j.id!, j.hostedUrl ?? ''),
			title: j.text ?? '',
			category: (j.categories?.team ?? '').trim(),
			location: (j.categories?.location ?? '').trim(),
			postedAt: j.createdAt ? new Date(j.createdAt) : null
		}));
}

const fetchers = { greenhouse, ashby, lever };

export const board: JobBoardScraper = {
	async list() {
		const companies = await fetchCompanies();
		const lists = await mapConcurrent(companies, 4, (c) => fetchers[c.ats](c));
		const byKey = new Map<string, ScrapedJob>();
		for (const j of lists.flat()) if (!byKey.has(j.key)) byKey.set(j.key, j);
		if (byKey.size === 0) throw new Error(`${SITE}: the boards list no jobs`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
