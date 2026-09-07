import { fetchWithRetry, mapConcurrent } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Hamilton's own careers site (a wordpress build) — the one board here whose
// jobs are at the company itself, like point72's. The listing page renders
// only the english postings, so the job-posting sitemap names the whole
// board and every posting's page is read for its info block: the hiring
// entity, business area and location, labelled in the posting's language.
// The description is the text between the info block and the apply form.

const HOST = 'jobs.hamilton.ch';

// the info block's label/value pairs, tags stripped into alternating tokens
function tokensOf(segment: string): string[] {
	return segment
		.split(/<[^>]+>/)
		.map((t) => t.replace(/\s+/g, ' ').trim())
		.filter(Boolean);
}

function infoValue(tokens: string[], ...labels: string[]): string {
	for (const label of labels) {
		const i = tokens.indexOf(label);
		if (i >= 0 && tokens[i + 1]) return tokens[i + 1];
	}
	return '';
}

function segment(html: string, from: string, to: string): string {
	const start = html.indexOf(from);
	if (start < 0) return '';
	const end = html.indexOf(to, start);
	return html.slice(start, end > 0 ? end : start + 6000);
}

async function postingPage(url: string): Promise<string | null> {
	const resp = await fetchWithRetry(url);
	if (resp.status === 404) return null;
	if (!resp.ok) throw new Error(`${url}: answered ${resp.status}`);
	return resp.text();
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(`https://${HOST}/job-posting-sitemap.xml`);
		if (!resp.ok) throw new Error(`${HOST}: the job sitemap answered ${resp.status}`);
		const urls = [...(await resp.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
			.map((m) => m[1])
			.filter((u) => u.includes('/job-posting/'));
		if (urls.length === 0) throw new Error(`${HOST}: the job sitemap names no postings`);

		const jobs = await mapConcurrent(urls, 6, async (url): Promise<ScrapedJob | null> => {
			const key = url.match(/_jr-(\d+)\/?$/)?.[1];
			if (!key) return null;
			const html = await postingPage(url);
			if (!html) return null;
			const title = (html.match(/<title>([^<]*?)(?:\s*[-–]\s*Hamilton Jobs)?<\/title>/)?.[1] ?? '').trim();
			const info = tokensOf(segment(html, 'module-info', 'module-image'));
			return {
				key,
				company: infoValue(info, 'Firma', 'Company') || 'Hamilton',
				companyUrl: `https://${HOST}/`,
				title,
				url,
				applyUrl: url,
				category: infoValue(info, 'Bereich', 'Business Area'),
				sector: '',
				location: infoValue(info, 'Standort', 'Location'),
				salary: null,
				postedAt: null
			};
		});
		const byKey = new Map<string, ScrapedJob>();
		for (const j of jobs) if (j && j.title && !byKey.has(j.key)) byKey.set(j.key, j);
		// fail loudly rather than importing a partial list
		if (byKey.size < urls.length * 0.7) {
			throw new Error(`${HOST}: read ${byKey.size} of ${urls.length} postings`);
		}
		return [...byKey.values()];
	},

	async detail(job): Promise<ScrapedJobDetail | null> {
		const html = await postingPage(job.url);
		if (!html) return null;
		const description = tokensOf(segment(html, 'module-text', 'module-apply-now')).join('\n');
		return { description };
	}
};
