import { atsDetail } from './ats';
import { fetchJson, fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Curiosity VC's portfolio jobs — a single-page app built on lovable over a
// supabase database: the browser reads the "job_listings" table, with each
// listing's company, through supabase's rest api under the public client key
// the app ships with, and shows the active ones. The scraper reads the same
// way: the key is taken from the app's script (its name is hashed anew with
// every build, so it is found through the page), and the listings come in
// one request. A listing's description, where it has one, is served from a
// short-lived copy of the list; the others are read off their postings.

const BASE = 'https://jobs.curiosityvc.com';
const LIST_TTL_MS = 10 * 60_000;
const NOT_A_JOB = /\bopen application\b|\bspontaneous application\b/i;

interface Listing {
	id?: string | null;
	title?: string | null;
	description?: string | null;
	location?: string[] | string | null;
	discipline?: string | null;
	remote_friendly?: boolean | null;
	salary_min?: number | null;
	salary_max?: number | null;
	currency?: string | null;
	job_url?: string | null;
	application_url?: string | null;
	created_at?: string | null;
	companies?: { name?: string | null; website_url?: string | null } | null;
}

// the supabase project and the public ("anon") key the app reads it with
async function client(): Promise<{ url: string; key: string }> {
	const page = await fetchWithRetry(BASE);
	if (!page.ok) throw new Error(`${BASE}: the page answered ${page.status}`);
	const script = (await page.text()).match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
	if (!script) throw new Error(`${BASE}: the page names no app script`);
	const resp = await fetchWithRetry(`${BASE}${script}`);
	if (!resp.ok) throw new Error(`${BASE}: the app script answered ${resp.status}`);
	const js = await resp.text();
	const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
	const key = [...js.matchAll(/eyJ[\w-]{10,}\.[\w-]{20,}\.[\w-]{10,}/g)]
		.map((m) => m[0])
		.find((token) => {
			try {
				return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role === 'anon';
			} catch {
				return false;
			}
		});
	if (!url || !key) throw new Error(`${BASE}: the app script holds no supabase client`);
	return { url, key };
}

let listed: { rows: Promise<Listing[]>; readAt: number } | undefined;

function readListings(): Promise<Listing[]> {
	if (listed && Date.now() - listed.readAt < LIST_TTL_MS) return listed.rows;
	const rows = client().then(({ url, key }) =>
		fetchJson<Listing[]>(
			`${url}/rest/v1/job_listings?status=eq.active&order=created_at.desc&select=` +
				'id,title,description,location,discipline,remote_friendly,salary_min,salary_max,currency,' +
				'job_url,application_url,created_at,companies(name,website_url)',
			{ headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' } }
		)
	);
	listed = { rows, readAt: Date.now() };
	// a failed read is not kept
	rows.catch(() => (listed = undefined));
	return rows;
}

export const board: JobBoardScraper = {
	async list() {
		const jobs: ScrapedJob[] = [];
		for (const row of await readListings()) {
			const title = (row.title ?? '').trim();
			if (!row.id || !title || NOT_A_JOB.test(title)) continue;
			const url = row.job_url || row.application_url || BASE;
			const places = (Array.isArray(row.location) ? row.location : [row.location ?? ''])
				.map((p) => (p ?? '').trim())
				.filter(Boolean)
				.join('; ');
			jobs.push({
				key: row.id,
				company: (row.companies?.name ?? '').trim(),
				companyUrl: row.companies?.website_url ?? '',
				title,
				url,
				applyUrl: url,
				category: row.discipline ?? '',
				sector: '',
				location: [places, row.remote_friendly ? 'remote' : ''].filter(Boolean).join(' · '),
				salary:
					row.salary_min || row.salary_max
						? {
								min: row.salary_min || null,
								max: row.salary_max || null,
								currency: (row.currency ?? '').toUpperCase(),
								period: ''
							}
						: null,
				postedAt: row.created_at ? new Date(row.created_at) : null
			});
		}
		if (jobs.length === 0) throw new Error(`${BASE}: no active listings`);
		return jobs;
	},

	async detail(job) {
		// by the listing's id where the enrichment pass hands it over: two
		// listings may share a careers page as their link
		const row = (await readListings()).find((r) =>
			job.key ? r.id === job.key : (r.job_url || r.application_url || BASE) === job.url
		);
		const description = row?.description?.trim();
		// most listings carry none: then the posting's own, where its
		// applicant tracking system is one that is read
		return description ? { description } : atsDetail(job.applyUrl);
	}
};
