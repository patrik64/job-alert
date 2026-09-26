import { atsDetail } from './ats';
import { flightText } from './considernext';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Compound's "Portfolio Role Finder" — a next.js app of its own that pulls
// the open roles off its companies' boards (ashby, greenhouse, lever and the
// like) and renders them all into one page. The page's server payload holds
// the companies as plain json — name, website, category — each with its
// jobs: a title, the posting's link, a location and a region tag. The ids
// there are the app's own, so a job is keyed by its posting link instead —
// query and all, since some companies tell their postings apart only there
// (wayve.firststage.co/jobs?gh_jid=…).

const PAGE = 'https://jobs.compound.vc/';

interface CompoundJob {
	id?: number;
	title?: string;
	url?: string;
	location?: string;
	geo?: string;
}

interface CompoundCompany {
	name?: string;
	website?: string | null;
	category?: string | null;
	jobs?: CompoundJob[];
}

// the end of the json value opening at start (an object or array), strings
// and their escapes stepped over
function valueEnd(text: string, start: number): number {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (c === '"') {
			for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
		} else if (c === '{' || c === '[') depth++;
		else if ((c === '}' || c === ']') && --depth === 0) return i + 1;
	}
	return -1;
}

const jobKey = (url: string) => url.split('#')[0];

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const flight = flightText(await resp.text());
		const byKey = new Map<string, ScrapedJob>();
		for (const m of flight.matchAll(/\{"id":\d+,"name":"/g)) {
			const end = valueEnd(flight, m.index);
			if (end < 0) continue;
			let company: CompoundCompany;
			try {
				company = JSON.parse(flight.slice(m.index, end));
			} catch {
				continue;
			}
			if (!company.name || !Array.isArray(company.jobs)) continue;
			for (const job of company.jobs) {
				if (!job.title || !job.url || !/^https?:\/\//i.test(job.url)) continue;
				const key = jobKey(job.url);
				if (byKey.has(key)) continue;
				const location = (job.location ?? '').trim();
				const remote = job.geo === 'remote' && !/remote/i.test(location);
				byKey.set(key, {
					key,
					company: company.name,
					companyUrl: company.website ? `https://${company.website.replace(/^https?:\/\//, '')}` : '',
					title: job.title,
					url: job.url,
					applyUrl: job.url,
					category: '',
					sector: (company.category ?? '').replace(/-/g, ' '),
					location: [location, remote ? 'remote' : ''].filter(Boolean).join(' · '),
					salary: null,
					postedAt: null
				});
			}
		}
		if (byKey.size === 0) throw new Error(`${PAGE}: no jobs in the page's data`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
