import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Tau Ventures curates its careers page by hand on its Astro site: the whole
// list ships server-rendered, each job an anchor card that links straight to
// the posting and spells out its fields as data attributes. The cards carry
// no ids, so the posting's url stands in as the key; descriptions are read
// from the posting's applicant tracking system where it is one of the open
// ones ("Posted 7+ days ago" is too vague to count as a date).

const BOARD_URL = 'https://www.tauventures.com/careers';

const CARD = /<a\b[^>]*class="[^"]*\bjob-card\b[^>]*>/g;

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

const attr = (tag: string, name: string) =>
	decode(tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '').trim();

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD_URL);
		if (!resp.ok) throw new Error(`${BOARD_URL}: answered ${resp.status}`);
		const jobs = new Map<string, ScrapedJob>();
		for (const tag of (await resp.text()).match(CARD) ?? []) {
			const href = attr(tag, 'href');
			const title = attr(tag, 'data-title');
			const company = attr(tag, 'data-company');
			if (!href || !title || !company)
				throw new Error(`${BOARD_URL}: could not read the card ${tag.slice(0, 80)}`);
			jobs.set(href, {
				key: href.replace(/^https?:\/\//, ''),
				company,
				// no company pages on the board — its careers page stands in
				companyUrl: BOARD_URL,
				title,
				// no job pages either: the card links straight to the posting
				url: href,
				applyUrl: href,
				category: attr(tag, 'data-category'),
				sector: '',
				location: attr(tag, 'data-location'),
				salary: null,
				postedAt: null
			});
		}
		if (jobs.size === 0) throw new Error(`${BOARD_URL}: the board lists no jobs`);
		return [...jobs.values()];
	},

	async detail({ applyUrl }): Promise<ScrapedJobDetail | null> {
		return atsDetail(applyUrl);
	}
};
