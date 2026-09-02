import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Meron's careers page is a hand-rolled static build: every job sits in the
// html as a link straight into the company's own hiring system (greenhouse,
// comeet, breezy, or a careers page on the company's site), with the title,
// company, function and location beside it. The page is the whole board — no
// api behind it, no pages per job — so the rows are read off the markup and
// the links lead to the postings themselves.

const PAGE = 'https://www.meron.vc/jobs';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "30 Aug" — no year written; a day that has not happened yet this year
// happened last year
function postedOn(text: string, now: Date): Date | null {
	const m = text.match(/^(\d{1,2}) ([A-Za-z]{3})$/);
	if (!m) return null;
	const month = MONTHS.indexOf(m[2].toLowerCase());
	if (month < 0) return null;
	const posted = new Date(Date.UTC(now.getUTCFullYear(), month, Number(m[1])));
	if (posted.getTime() - now.getTime() > 2 * 86_400_000)
		posted.setUTCFullYear(posted.getUTCFullYear() - 1);
	return posted;
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const html = await resp.text();
		const now = new Date();
		const byKey = new Map<string, ScrapedJob>();
		for (const row of html.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
			const [, href, block] = row;
			const title = block.match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1]?.trim();
			const company = block
				.match(/text-forest\/90">\s*<span[^>]*>\s*<\/span>([^<]+)<\/span>/)?.[1]
				?.trim();
			// the page's other links (nav, footer, the fund's own pages) carry
			// no job row
			if (!title || !company) continue;
			// several jobs may share one careers-page link, so the title is
			// part of the key; the page renders every row twice
			const key = `${href}#${title}`;
			if (byKey.has(key)) continue;
			const posted = block.match(/tabular-nums">([^<]+)<\/span>/)?.[1];
			byKey.set(key, {
				key,
				company,
				companyUrl: '',
				title,
				url: href,
				applyUrl: href,
				category: block.match(/·<\/span>\s*<span>([^<]+)<\/span>/)?.[1]?.trim() ?? '',
				sector: '',
				location:
					block.match(/<span class="normal-case[^"]*">([^<]+)<\/span>/)?.[1]?.trim() ?? '',
				salary: null,
				postedAt: posted ? postedOn(posted.trim(), now) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${PAGE}: no job rows on the page`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
