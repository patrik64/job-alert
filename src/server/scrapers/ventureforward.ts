import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Venture Forward's job board — investment roles at VC firms (and at the
// venture arms of larger companies), posted by the firms themselves; not a
// portfolio. A wordpress page whose jetengine listing grid renders every
// open role — postings drop off after thirty days — as an item keyed by its
// wordpress post id: the title linking to the posting, then the firm, the
// location (a heading of its own when the role is remote) and the day it
// was posted. There is no page of the board's own for a job, so its link is
// the posting itself. The site's cloudflare turns away the browser user
// agent the other scrapers send, which bots overuse; this one says what it
// is instead, and is let in.

const PAGE = 'https://ventureforward.org/resources-for-emerging-vc/job-board/';
const USER_AGENT = 'job-alert (+https://job-alert-pax.vercel.app)';

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

// "September 16, 2026"
function postedOn(text: string): Date | null {
	const m = text.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
	const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
	return m && month >= 0 ? new Date(Date.UTC(Number(m[3]), month, Number(m[2]))) : null;
}

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, '')
		.replace(/&#8211;/g, '–')
		.replace(/&#038;|&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE, { headers: { 'user-agent': USER_AGENT } });
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const html = await resp.text();
		const jobs: ScrapedJob[] = [];
		for (const item of html.split('<div class="jet-listing-grid__item ').slice(1)) {
			const id = item.match(/data-post-id="(\d+)"/)?.[1];
			const link = item.match(/<a href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
			if (!id || !link) continue;
			// the item's visible text in order: the title, the firm, the
			// location, the day — the location missing now and then
			const leaves = item
				.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>/g, '')
				.split(/<[^>]+>/)
				.map(text)
				.filter(Boolean);
			const title = text(link[2]);
			const rest = leaves.slice(leaves.indexOf(title) + 1);
			const dayAt = rest.findIndex((l) => postedOn(l));
			const fields = dayAt >= 0 ? rest.slice(0, dayAt) : rest;
			jobs.push({
				key: id,
				company: fields[0] ?? '',
				companyUrl: '',
				title,
				url: link[1],
				applyUrl: link[1],
				category: '',
				sector: '',
				location: fields.slice(1).join('; '),
				salary: null,
				postedAt: dayAt >= 0 ? postedOn(rest[dayAt]) : null
			});
		}
		if (jobs.length === 0) throw new Error(`${PAGE}: no job rows on the page`);
		return jobs;
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
