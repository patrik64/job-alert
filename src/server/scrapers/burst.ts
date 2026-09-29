import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Burst Capital's "Portfolio Jobs Board" — a page of its website-builder
// site embedding a small app that reads one json file off github, written
// daily by a crawler of Burst's own: the jobs on its companies' careers
// pages, each a title, a department, a location, the posting's link and the
// company with its website. There are no ids, so a job is keyed by its link,
// query, anchor and all (boards.greenhouse.io postings are told apart by
// gh_jid, one-page careers sites by the anchor); nor a page of the board's
// own for a job, so its link is the posting itself.
//
// Most links are postings on the companies' applicant tracking systems.
// Where a company has none the crawler falls back to the links on its
// careers page — "a rough scan at best", the board says — filed under the
// catch-all department, and picks up some that are no postings: mail
// addresses, the page's calls to go see its openings, links to the site's
// other pages (the blog, the press page, a product). Those are left out;
// titles it read twice over off an ashby job list are cut back to one copy.
// Others keep the place or the blurb their careers page runs into the
// title, as the board shows them.

const DATA = 'https://raw.githubusercontent.com/burstcapital/burst-jobs/main/jobs.json';

interface BurstJob {
	title?: string;
	department?: string;
	location?: string;
	url?: string;
	company?: string;
	company_website?: string;
}

// the department the crawler files a job under when it has none to go by
const NO_DEPARTMENT = 'General';
const NO_LOCATION = 'Not specified';

// a careers page's call to go see its openings, taken for a job's title
const CALL_TO_OPENINGS = /^(see|view|browse|explore)\b.*\b(positions|openings|roles|jobs)$|^apply( now| here)?$/i;

// a link that could lead to a posting: a careers or jobs page, or a posting
// on an applicant tracking system (whose hosts mostly say as much)
const POSTING_LINK = /career|job|position|opening|apply|vacanc|hiring|recruit|\broles?\b|breezy\.hr/i;

function postingLink(link: string): boolean {
	try {
		const url = new URL(link);
		return POSTING_LINK.test(url.hostname + url.pathname);
	} catch {
		return false;
	}
}

// "Assistant ControllerAssistant ControllerGeneral & AdministrativeSan
// Francisco, CAApply" → "Assistant Controller": a title read twice off an
// ashby list, run into the team, the place and the apply button
function once(title: string): string {
	for (let n = 8; n * 2 <= title.length; n++) {
		if (title.startsWith(title.slice(0, n), n)) return title.slice(0, n).trim();
	}
	return title;
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(DATA);
		if (!resp.ok) throw new Error(`${DATA}: the file answered ${resp.status}`);
		const data = (await resp.json()) as { jobs?: BurstJob[] };
		const byKey = new Map<string, ScrapedJob>();
		for (const job of data.jobs ?? []) {
			const link = (job.url ?? '').trim();
			const title = once((job.title ?? '').replace(/\s+/g, ' ').trim());
			const company = (job.company ?? '').trim();
			if (!title || !company || !/^https?:\/\//i.test(link) || byKey.has(link)) continue;
			const department = (job.department ?? '').trim();
			const crawled = department === NO_DEPARTMENT;
			if (crawled && (CALL_TO_OPENINGS.test(title) || !postingLink(link))) continue;
			const website = (job.company_website ?? '').trim();
			const location = (job.location ?? '').trim();
			byKey.set(link, {
				key: link,
				company,
				companyUrl: /^https?:\/\//i.test(website) ? website : '',
				title,
				url: link,
				applyUrl: link,
				category: crawled ? '' : department,
				sector: '',
				location: location === NO_LOCATION ? '' : location,
				salary: null,
				postedAt: null
			});
		}
		if (byKey.size === 0) throw new Error(`${DATA}: no jobs in the file`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
