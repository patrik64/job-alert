import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// S2G's open-positions page is hand-maintained on the fund's own site: an
// <article> card per job with the company in a label div, the title inside
// an h3 whose link is the posting itself (an ats page, linkedin, adp).
// Nothing carries an id or a location, so — as on willow's board — the
// apply link is the job's identity and descriptions come from the posting's
// applicant tracking system where there is one.

const BOARD = 'https://www.s2ginvestments.com/team/careers/open-positions';

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD);
		if (!resp.ok) throw new Error(`${BOARD}: the page answered ${resp.status}`);
		const html = await resp.text();
		const byKey = new Map<string, ScrapedJob>();
		for (const card of html.split('<article').slice(1)) {
			const company = text(card.match(/text-label[^"]*">([^<]*)</)?.[1] ?? '');
			const title = text(card.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? '');
			const apply = card.match(/href="(https?:\/\/(?!www\.s2ginvestments\.com)[^"]+)"/)?.[1];
			if (!title || !apply) continue;
			const applyUrl = apply.replace(/&amp;/g, '&');
			if (!byKey.has(applyUrl)) {
				byKey.set(applyUrl, {
					key: applyUrl,
					company,
					companyUrl: BOARD,
					title,
					url: BOARD,
					applyUrl,
					category: '',
					sector: '',
					location: '',
					salary: null,
					postedAt: null
				});
			}
		}
		if (byKey.size === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
