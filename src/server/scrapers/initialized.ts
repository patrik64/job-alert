import { postingKey } from '../../shared/posting';
import { atsDetail } from './ats';
import { flightText, readArray } from './considernext';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Initialized moved its board onto its own next.js site in october 2026
// (jobs.initialized.com redirects there; consider still supplies the data).
// The page server-renders the whole list at once: each job with its role,
// company, places, functions and the link to its posting, and how many days
// ago it was posted as of the page's build. Consider's job ids did not come
// along, so a job is keyed by its posting's link, tracking tags stripped. The
// site has a page per company only as a filter on the list; the jobs of
// "Stealth", whose name the site withholds, link to pages of its own. No
// salaries or sectors on the page.

const BOARD = 'https://initialized.com/jobs';
const LIST = '"initialData":{"jobs":';
const DAY_MS = 86_400_000;

interface InitializedJob {
	role?: string | null;
	company?: string | null;
	companySlug?: string | null;
	functions?: string[] | null;
	places?: string[] | null;
	postedDays?: number | null;
	remote?: boolean | null;
	url?: string | null;
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(BOARD);
		if (!resp.ok) throw new Error(`${BOARD}: the page answered ${resp.status}`);
		const text = flightText(await resp.text());
		const at = text.indexOf(LIST);
		if (at < 0) throw new Error(`${BOARD}: the page carries no job list`);
		const array = readArray(text, at + LIST.length);
		const rest = text.slice(at + LIST.length + array.length, at + LIST.length + array.length + 200);
		const raw = JSON.parse(array) as InitializedJob[];
		// a list cut short would close every job left off it
		const total = Number(rest.match(/^,"total":(\d+)/)?.[1]);
		if (raw.length !== total) throw new Error(`${BOARD}: the page lists ${raw.length} of ${total} jobs`);
		const builtAt = Number(rest.match(/"builtAt":(\d+)/)?.[1]);

		const byKey = new Map<string, ScrapedJob>();
		for (const j of raw) {
			const title = (j.role ?? '').trim();
			const company = (j.company ?? '').trim();
			if (!title || !company || !j.url) continue;
			const link = new URL(j.url, BOARD);
			const key = postingKey(link.href, '').replace(/^https?:\/\//, '');
			const companyUrl = `${BOARD}?company=${encodeURIComponent(j.companySlug ?? '')}`;
			const places = [...new Set((j.places ?? []).map((p) => p.trim()).filter(Boolean))].join('; ');
			const mode = j.remote && !/remote/i.test(places) ? 'remote' : '';
			byKey.set(key, {
				key,
				company,
				companyUrl,
				title,
				url: link.hostname === new URL(BOARD).hostname ? link.href : companyUrl,
				applyUrl: link.href,
				category: (j.functions ?? []).join(', '),
				sector: '',
				location: [places, mode].filter(Boolean).join(' · '),
				salary: null,
				postedAt:
					builtAt && typeof j.postedDays === 'number' ? new Date(builtAt - j.postedDays * DAY_MS) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${BOARD}: the board lists no jobs`);
		return [...byKey.values()];
	},

	detail({ applyUrl }) {
		return atsDetail(applyUrl);
	}
};
