import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// CDP Venture Capital's XJobs — the jobs at the startups of Italy's national
// venture fund, on an odoo site of its own. The search page's json-rpc route
// hands over every job at once as rendered cards — title, company (its id is
// in its logo's url), location — with the total beside them; a job's
// overlay, from a second route, holds the description. The page opens that
// overlay from ?open_job=<id>, the one link to a job the board has, where its
// "apply" button leads to the posting. The site's data came in with its
// UTF-8 read as Latin-1 ("fÃ¼r"): a run of characters that are UTF-8 bytes
// in disguise is turned back ("für"), which genuine accents ("São") never
// form.

const BASE = 'https://xjobs.cdpventurecapital.it';

async function rpc<T>(route: string, params: object): Promise<T> {
	const resp = await fetchWithRetry(`${BASE}${route}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params, id: 1 })
	});
	if (!resp.ok) throw new Error(`${BASE}${route}: answered ${resp.status}`);
	const body = (await resp.json()) as { result?: T; error?: { message?: string } };
	if (body.error) throw new Error(`${BASE}${route}: ${body.error.message ?? 'failed'}`);
	return body.result as T;
}

// a utf-8 lead byte and its continuation bytes, each shown as its latin-1 character
const MOJIBAKE =
	/[Â-ß][\u0080-¿]|[à-ï][\u0080-¿]{2}|[ð-ô][\u0080-¿]{3}/g;
const repair = (s: string) =>
	s.replace(MOJIBAKE, (seq) => {
		const decoded = Buffer.from(seq, 'latin1').toString('utf8');
		return decoded.includes('�') ? seq : decoded;
	});

const text = (html: string) =>
	repair(
		html
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);

const jobUrl = (id: string) => `${BASE}/en/search-results?category=jobs&open_job=${id}`;

export const board: JobBoardScraper = {
	async list() {
		const { html, count } = await rpc<{ html: string; count: number }>('/search/filter/category', {
			query: '',
			category: 'jobs',
			filters: { sort: 'recent' }
		});
		const byId = new Map<string, ScrapedJob>();
		for (const card of html.split('data-job_id="').slice(1)) {
			const id = card.match(/^(\d+)"/)?.[1];
			const title = card.match(/class="jp_row_title"[^>]*>([\s\S]*?)<\/p>/)?.[1];
			if (!id || !title || byId.has(id)) continue;
			const companyId = card.match(/\/web\/image\/ecosystem\.ecosystem\/(\d+)\//)?.[1];
			byId.set(id, {
				key: id,
				company: text(card.match(/class="jp_row_company">([\s\S]*?)<\/span>/)?.[1] ?? ''),
				companyUrl: companyId ? `${BASE}/en/companies/${companyId}` : '',
				title: text(title),
				url: jobUrl(id),
				applyUrl: jobUrl(id),
				category: '',
				sector: '',
				location: text(card.match(/class="jp_row_location">([\s\S]*?)<\/span>/)?.[1] ?? ''),
				salary: null,
				postedAt: null
			});
		}
		// fail loudly rather than importing a partial list
		if (byId.size === 0 || byId.size < count * 0.95) {
			throw new Error(`${BASE}: collected ${byId.size} of ${count} jobs`);
		}
		return [...byId.values()];
	},

	async detail(job) {
		const id = job.key ?? job.url.match(/open_job=(\d+)/)?.[1];
		if (!id) return null;
		const result = await rpc<{ template?: string; error?: boolean }>('/open/job/position/overlay', {
			job_id: Number(id)
		});
		// "Job position not found." — gone from the board
		if (!result || result.error || !result.template) return null;
		const description = result.template.match(
			/<div class="jp_desc_box">\s*<span[^>]*>([\s\S]*?)<\/span>/
		)?.[1];
		return { description: description ? repair(description.trim()) : '' };
	}
};
