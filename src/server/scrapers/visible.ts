import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Visible's board is a static page on the fund's own site: a fold-out per
// portfolio company with a link per job straight to the posting on its
// applicant tracking system — that link is the job's identity — and a meta
// line saying "department · location", or just the location. Companies
// whose section only says "View openings" list nothing here and contribute
// no rows. Descriptions come from the posting's ats where it is a
// supported one.

const BOARD = 'https://visibleventures.com/jobs/';

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD);
		if (!resp.ok) throw new Error(`${BOARD}: the jobs page answered ${resp.status}`);
		const html = await resp.text();
		const jobs: ScrapedJob[] = [];
		for (const block of html.split(/<details class="group/).slice(1)) {
			const company = block.match(/<h2[^>]*>([^<]+)<\/h2>/)?.[1].trim() ?? '';
			const rows = block.matchAll(
				/<a href="(https?:\/\/[^"]+)"[^>]*class="group\/role[^"]*"[^>]*><div><p[^>]*>(.*?)<\/p>(?:<p[^>]*>(.*?)<\/p>)?<\/div>/gs
			);
			for (const [, applyUrl, title, meta] of rows) {
				if (!title) continue;
				// "Marketing · San Francisco", or just the location
				const parts = (meta ?? '').split('·').map((p) => p.trim());
				const [category, location] = parts.length > 1 ? parts : ['', parts[0] ?? ''];
				jobs.push({
					key: applyUrl,
					company,
					companyUrl: BOARD,
					title: title.trim(),
					url: BOARD,
					applyUrl,
					category,
					sector: '',
					location,
					salary: null,
					postedAt: null
				});
			}
		}
		if (jobs.length === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return jobs;
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
