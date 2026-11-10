import { atsDetail } from './ats';
import { fetchWithRetry, mapConcurrent } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// S2G's open-positions page is a sprig listing on the fund's craft cms site:
// an <article> card per job with the company in a label div, the title inside
// an h3 whose link is the posting itself (an ats page, linkedin, adp).
// Nothing carries an id or a location, so — as on willow's board — the
// apply link is the job's identity and descriptions come from the posting's
// applicant tracking system where there is one. The listing grew to dozens
// of pages of twelve (2026-11): the first page links every other one
// (?page=n), and a page past the last repeats the last, so the crawl goes up
// to the highest page the first one names.

const BOARD = 'https://www.s2ginvestments.com/team/careers/open-positions';
const CONCURRENCY = 4;

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// titles come typeset: ordinals, ampersands and capitals wrapped in inline
// tags (2<sup class="ordinal">nd</sup> Shift), which close up without a space
const inline = (html: string) => html.replace(/<\/?(?:a|span|sup|sub|em|strong|i|b)\b[^>]*>/g, '');

async function page(n: number): Promise<string> {
	const url = n === 1 ? BOARD : `${BOARD}?page=${n}`;
	const resp = await fetchWithRetry(url);
	if (!resp.ok) throw new Error(`${url}: the page answered ${resp.status}`);
	return resp.text();
}

export const board: JobBoardScraper = {
	async list() {
		const first = await page(1);
		const last = Math.max(1, ...[...first.matchAll(/[?&;]page=(\d+)/g)].map((m) => Number(m[1])));
		const rest = await mapConcurrent(
			Array.from({ length: last - 1 }, (_, i) => i + 2),
			CONCURRENCY,
			(n) => page(n)
		);
		const byKey = new Map<string, ScrapedJob>();
		for (const html of [first, ...rest]) {
			for (const card of html.split('<article').slice(1)) {
				const company = text(card.match(/text-label[^"]*">([^<]*)</)?.[1] ?? '');
				const title = text(inline(card.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? ''));
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
		}
		if (byKey.size === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
