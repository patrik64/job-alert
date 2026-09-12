import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// The Yocto Project's community jobs page — a hand-curated wordpress list of
// embedded-linux roles, not a portfolio. Each row is a link straight to the
// employer's own posting (greenhouse, workday, rippling, a careers page…),
// wrapping the title, company and country. Several rows can share one link,
// so the title is part of the key; the description, where the posting sits on
// a system we can read, comes from that posting.

const PAGE = 'https://www.yoctoproject.org/community/jobs/';

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const html = await resp.text();
		const byKey = new Map<string, ScrapedJob>();
		for (const m of html.matchAll(
			/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>\s*<div[^>]*class="job wpb_row[^"]*"[\s\S]*?<\/a>/g
		)) {
			const [block, href] = [m[0], m[1]];
			const title = block.match(/<h4>([^<]+)<\/h4>/)?.[1]?.trim();
			if (!title) continue;
			const company = block.match(/job-company">([^<]+)</)?.[1]?.trim() ?? '';
			const country = block.match(/job-country">([^<]+)</)?.[1]?.trim() ?? '';
			const key = `${href}#${title}`;
			if (byKey.has(key)) continue;
			byKey.set(key, {
				key,
				company,
				companyUrl: '',
				title,
				url: href,
				applyUrl: href,
				category: '',
				sector: '',
				location: country,
				salary: null,
				postedAt: null
			});
		}
		if (byKey.size === 0) throw new Error(`${PAGE}: no job rows on the page`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
