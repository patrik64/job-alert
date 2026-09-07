import { flightText, readArray } from './considernext';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Humba's board lives on the fund's own next.js site: the listing and each
// job's page carry their data in the app router's flight pushes (decoded by
// considernext's helpers), and jobs link to pages on the fund's site, which
// hold the description and the apply button.

const BASE = 'https://humbaventures.com';

interface HumbaJob {
	href?: string | null;
	title?: string | null;
	location?: string | null;
	department?: string | null;
	date?: { iso?: string | null } | null;
	company?: { slug?: string | null; name?: string | null } | null;
}

// the json string whose opening quote sits at `from`
function readString(text: string, from: number): string {
	let escaped = false;
	for (let i = from + 1; i < text.length; i++) {
		const ch = text[i];
		if (escaped) escaped = false;
		else if (ch === '\\') escaped = true;
		else if (ch === '"') return JSON.parse(text.slice(from, i + 1)) as string;
	}
	throw new Error('unterminated string in the server payload');
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(`${BASE}/jobs/`);
		if (!resp.ok) throw new Error(`${BASE}/jobs: the page answered ${resp.status}`);
		const text = flightText(await resp.text());
		const at = text.indexOf('"jobs":[');
		if (at < 0) throw new Error(`${BASE}/jobs: the page carries no job list`);
		const raw = JSON.parse(readArray(text, at + '"jobs":'.length)) as HumbaJob[];
		const byKey = new Map<string, ScrapedJob>();
		for (const j of raw) {
			if (!j.href || !j.title) continue;
			if (byKey.has(j.href)) continue;
			byKey.set(j.href, {
				key: j.href,
				company: j.company?.name ?? '',
				companyUrl: j.company?.slug ? `${BASE}/jobs/${j.company.slug}/` : '',
				title: j.title,
				url: `${BASE}/jobs${j.href}/`,
				applyUrl: '',
				category: j.department ?? '',
				sector: '',
				location: j.location ?? '',
				salary: null,
				postedAt: j.date?.iso ? new Date(j.date.iso) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${BASE}/jobs: no jobs on the page`);
		return [...byKey.values()];
	},

	async detail(job): Promise<ScrapedJobDetail | null> {
		const resp = await fetchWithRetry(job.url);
		if (resp.status === 404) return null;
		if (!resp.ok) throw new Error(`${BASE}: the job page answered ${resp.status}`);
		const text = flightText(await resp.text());
		const at = text.indexOf('"description":"');
		if (at < 0) return null;
		return { description: readString(text, at + '"description":'.length) };
	}
};
