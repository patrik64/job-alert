import { atsDetail } from './ats';
import { flightText, readArray } from './considernext';
import { fetchWithRetry, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Moonfire's positions page — a next.js site whose server renders the
// portfolio's jobs into its payload as getro records (id, title, the
// posting's link, places, the company with its industries). It renders the
// newest fifty and says how many there are in all, but neither its filters
// nor any paging reach past those fifty — the filters only narrow them in
// the browser — so the board's own visitors see fifty, and so does this. The
// jobs link straight to their postings, where the descriptions are read (the
// records carry a teaser only).

const PAGE = 'https://www.moonfire.com/positions/';

interface MoonfireJob {
	id?: number | null;
	title?: string | null;
	url?: string | null;
	locations?: string[] | null;
	work_mode?: string | null;
	created_at?: string | null;
	job_functions?: string[] | null;
	compensation_min?: number | null;
	compensation_max?: number | null;
	compensation_currency?: string | null;
	compensation_period?: string | null;
	company?: { name?: string | null; visible_industry_tags?: string[] | null } | null;
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const flight = flightText(await resp.text());
		const list = flight.indexOf('"jobList":');
		const items = list < 0 ? -1 : flight.indexOf('"items":[', list);
		if (items < 0) throw new Error(`${PAGE}: the page carries no job list`);
		const records = JSON.parse(readArray(flight, items + '"items":'.length)) as MoonfireJob[];

		const byKey = new Map<string, ScrapedJob>();
		for (const j of records) {
			const title = (j.title ?? '').trim();
			if (!j.id || !title || !j.url) continue;
			const locations = [...new Set((j.locations ?? []).filter(Boolean))].join('; ');
			const remote = j.work_mode === 'remote' && !/remote/i.test(locations) ? 'remote' : '';
			const { compensation_min: min, compensation_max: max } = j;
			byKey.set(String(j.id), {
				key: String(j.id),
				company: (j.company?.name ?? '').trim(),
				companyUrl: '',
				title,
				url: j.url,
				applyUrl: j.url,
				category: (j.job_functions ?? []).filter(Boolean).join(', '),
				sector: (j.company?.visible_industry_tags ?? []).filter(Boolean).join(', '),
				location: [locations, remote].filter(Boolean).join(' · '),
				salary:
					min || max
						? {
								min: min || null,
								max: max || null,
								currency: (j.compensation_currency ?? '').toUpperCase(),
								period: normalizePeriod(j.compensation_period)
							}
						: null,
				postedAt: j.created_at ? new Date(j.created_at) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${PAGE}: no jobs in the page's data`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
