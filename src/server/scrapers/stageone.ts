import { fetchJson } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// StageOne's board is a Base44 app (an app-builder SPA) whose entity tables
// answer public json requests — the whole Job table, active rows and the
// closed history alike, plus a PortfolioCompany table with the websites and
// industries. The rows are the app's own nightly scrape of the portfolio's
// career pages, so identity is its external_id (kept when a job returns),
// the apply link is shared between a company's jobs (a careers page, not a
// posting), and the free-text fields say "Not specified" where its scraper
// found nothing. There are no job pages — the board page with the
// external_id as an inert fragment stands in, and the detail is read back
// from the same table by that fragment.

const BOARD = 'https://jobs.stageonevc.com/';
const APP_ID = '69407842413d733ccc0d29a9';
const API = `https://base44.app/api/apps/${APP_ID}/entities`;
const HEADERS = { accept: 'application/json', 'x-app-id': APP_ID };

interface Base44Job {
	id?: string | null;
	external_id?: string | null;
	title?: string | null;
	company_id?: string | null;
	company_name?: string | null;
	location?: string | null;
	location_type?: string | null;
	description?: string | null;
	requirements?: string | null;
	apply_url?: string | null;
	created_date?: string | null;
	is_active?: boolean | null;
	is_sample?: boolean | null;
}

interface Base44Company {
	id?: string | null;
	name?: string | null;
	website_url?: string | null;
	careers_page_url?: string | null;
	industry?: string | null;
}

// the rows are extracted by the app's own scraper, which writes its shrugs out
const unspecified = /^not\s+(specified|mentioned|explicitly stated|available)\.?$/i;
const clean = (s: string | null | undefined) => {
	const t = (s ?? '').trim();
	return unspecified.test(t) ? '' : t;
};

const listed = (jobs: Base44Job[]) => jobs.filter((j) => j.is_active && !j.is_sample);

export const board: JobBoardScraper = {
	async list() {
		const [jobs, companies] = await Promise.all([
			fetchJson<Base44Job[]>(`${API}/Job`, { headers: HEADERS }),
			fetchJson<Base44Company[]>(`${API}/PortfolioCompany`, { headers: HEADERS })
		]);
		const byId = new Map(companies.map((c) => [c.id ?? '', c]));
		const result: ScrapedJob[] = [];
		for (const j of listed(jobs)) {
			const key = j.external_id ?? j.id ?? '';
			if (!key || !j.title) continue;
			const company = byId.get(j.company_id ?? '');
			const location = clean(j.location);
			const mode = clean(j.location_type).toLowerCase();
			result.push({
				key,
				company: j.company_name ?? company?.name ?? '',
				companyUrl: company?.careers_page_url ?? company?.website_url ?? BOARD,
				title: j.title,
				url: `${BOARD}#${key}`,
				applyUrl: j.apply_url ?? '',
				category: '',
				sector: company?.industry ?? '',
				location: [location, location.toLowerCase().includes(mode) ? '' : mode]
					.filter(Boolean)
					.join(' · '),
				// when the board's own scrape first saw the job
				postedAt: j.created_date ? new Date(j.created_date) : null,
				salary: null
			});
		}
		if (result.length === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return result;
	},

	async detail(job) {
		const key = job.url.match(/#(.+)$/)?.[1];
		if (!key) return null;
		const jobs = await fetchJson<Base44Job[]>(`${API}/Job`, { headers: HEADERS });
		const row = listed(jobs).find((j) => (j.external_id ?? j.id) === key);
		if (!row) return null;
		const description = [clean(row.description), clean(row.requirements)]
			.filter(Boolean)
			.join('\n\n');
		return description ? { description } : null;
	}
};
