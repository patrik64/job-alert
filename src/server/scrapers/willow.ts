import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Willow Growth's board is a hand-maintained page on the fund's wordpress
// site: a section per company — a logo linking to the company's own website,
// then a fold-out per job with the title, the location and an apply link
// (greenhouse, gusto, linkedin, or a page on the company's site). Nothing
// carries an id, so the apply link is the job's identity — the page has been
// seen to reword a title while keeping the link — with linkedin's volatile
// search parameters normalized down to the posting's own id. The page names
// no company in text either (the logos are images), so the names are kept
// here by domain, and an unknown domain falls back to its own stem.

const BOARD = 'https://willowgrowth.com/talent/';

const NAMES: Record<string, string> = {
	'hellobubble.com': 'Bubble',
	'daehair.com': 'Dae',
	'drinkdesoi.com': 'De Soi',
	'elorea.com': 'Elorea',
	'perelelhealth.com': 'Perelel',
	'ysebeauty.com': 'Ysé Beauty'
};

const companyName = (site: string) => {
	let host = '';
	try {
		host = new URL(site).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
	const stem = host.split('.')[0];
	return NAMES[host] ?? stem.charAt(0).toUpperCase() + stem.slice(1);
};

// linkedin apply links point at a search view whose parameters list the
// company's other postings too, so they change when a sibling comes or
// goes — the posting's own id is the stable part
function cleanApplyUrl(raw: string): string {
	try {
		const url = new URL(raw);
		if (url.hostname.endsWith('linkedin.com')) {
			const id = url.searchParams.get('currentJobId');
			if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
		}
	} catch {
		// keep the link as written
	}
	return raw;
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD);
		if (!resp.ok) throw new Error(`${BOARD}: the talent page answered ${resp.status}`);
		const html = await resp.text();
		const jobs: ScrapedJob[] = [];
		// a company block: the logo link first, then a <details> per job
		for (const block of html.split(/class="positions__company/).slice(1)) {
			const site =
				block.match(/<a href="([^"]+)"[^>]*class="position__company-link"/)?.[1] ?? '';
			const company = companyName(site);
			for (const fold of block.split('<details>').slice(1)) {
				const title = fold.match(/<h6>(.*?)<\/h6>/s)?.[1].trim() ?? '';
				const location = fold.match(/<p class="p2">(.*?)<\/p>/s)?.[1].trim() ?? '';
				const apply = fold.match(/<a href="([^"]+)"[^>]*class="button"/)?.[1] ?? '';
				if (!title || !apply) continue;
				const applyUrl = cleanApplyUrl(apply);
				jobs.push({
					key: applyUrl,
					company,
					companyUrl: site,
					title,
					url: BOARD,
					applyUrl,
					category: '',
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
