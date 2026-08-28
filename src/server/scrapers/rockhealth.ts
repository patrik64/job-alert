import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Rock Health Capital's job board is hand-maintained on the fund's WordPress
// site: a block per company (name, blurb, careers link) holding an anchor per
// job with a title and location div, linking straight to the posting (ashby,
// lever, rippling). Some anchors point at the company's board root rather
// than a posting, so several jobs can share an applyUrl — the title is part
// of the key to keep them apart.
//
// The site's firewall rejects a browser user-agent presented by anything
// that is not a browser, but serves an honest non-browser one just fine.

const BOARD = 'https://rockhealthcapital.com/job-board/';
const HEADERS = { 'user-agent': 'job-alert (+https://job-alert-pax.vercel.app)' };

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD, { headers: HEADERS });
		if (!resp.ok) throw new Error(`${BOARD}: the page answered ${resp.status}`);
		const html = await resp.text();
		const byKey = new Map<string, ScrapedJob>();
		for (const block of html.split('<div class="company">').slice(1)) {
			const company = text(block.match(/dp_field_title[^>]*>(.*?)<\/div>/s)?.[1] ?? '');
			const companyUrl =
				block.match(/dp_field_link[^>]*>\s*<a[^>]*href="([^"]+)"/)?.[1] ?? BOARD;
			if (!company) continue;
			for (const [, attrs, inner] of block.matchAll(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S])*)<\/a>/g)) {
				if (!/class="job[\s"]/.test(attrs)) continue;
				const apply = attrs.match(/href="([^"]+)"/)?.[1];
				const title = text(inner.match(/dp_field_job_title[^>]*>(.*?)<\/div>/s)?.[1] ?? '');
				if (!apply || !title) continue;
				const applyUrl = apply.replace(/&amp;/g, '&');
				const key = `${applyUrl}#${title}`;
				if (byKey.has(key)) continue;
				byKey.set(key, {
					key,
					company,
					companyUrl,
					title,
					url: BOARD,
					applyUrl,
					category: '',
					sector: '',
					location: text(inner.match(/dp_field_job_location[^>]*>(.*?)<\/div>/s)?.[1] ?? ''),
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
