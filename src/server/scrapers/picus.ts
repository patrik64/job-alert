import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Picus Capital's job board — a page of its careers site (wordpress) listing
// the fund's own openings together with a few at its portfolio companies,
// marked "[EXTERNAL] Company - Title". Each row links its posting on
// recruiterflow, whose id keys the job, and names the place beside the
// title. The open application and the talent pool are not jobs and stay out;
// recruiterflow is no applicant tracking system the descriptions are read
// from, so the board has no detail.

const PAGE = 'https://careers.picuscap.com/career/';
const OWNER = 'Picus Capital';
const NOT_A_JOB = /\b(?:unsolicited|spontaneous) application\b|\btalent pool\b/i;

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const html = await resp.text();
		const jobs: ScrapedJob[] = [];
		for (const m of html.matchAll(
			/<a class="career-box[^"]*"[^>]*href="(https:\/\/recruiterflow\.com\/[^"]+\/jobs\/(\d+))"[^>]*>([\s\S]*?)<\/a>/g
		)) {
			const [, url, id, row] = m;
			const heading = text(row.match(/class="job_title[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '');
			if (!heading || NOT_A_JOB.test(heading)) continue;
			// "[EXTERNAL] Aidera - (Senior) AI Engineer (m/f/d)"
			const external = heading.match(/^\[EXTERNAL\]\s*(.+?)\s+-\s+(.+)$/i);
			jobs.push({
				key: id,
				company: external ? external[1] : OWNER,
				companyUrl: '',
				title: external ? external[2] : heading,
				url,
				applyUrl: url,
				category: '',
				sector: '',
				location: text(row.match(/class="job_city[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''),
				salary: null,
				postedAt: null
			});
		}
		if (jobs.length === 0) throw new Error(`${PAGE}: no job rows on the page`);
		return jobs;
	}
};
