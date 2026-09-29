import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Bowery Capital's portfolio jobs — a table on its craft cms site, drawn by
// a sprig component: twelve rows come with the page, and "load more" asks
// the component to draw itself again from a larger offset, which brings
// every row up to that offset and twelve more. The component is addressed by
// a signed config the page carries in its hx-vals, so the scraper reads that
// off the page and asks for all the rows in one go. A row is the company's
// logo (its alt text naming the company), the title, the day posted, the
// location and the posting's link — no ids and no page per job, so a job is
// keyed by that link and links there. The links are as typed into the cms,
// some with a third slash after the scheme, which the url parser reads as
// meant; a row with no company to its name is left out (a stray one links
// to a homepage).

const PAGE = 'https://bowerycap.com/portfolio-jobs';
const RENDER = 'https://bowerycap.com/index.php/actions/sprig-core/components/render';
// an offset past any the board will reach, so one render holds every row
const PAST_ALL_ROWS = 1000;

const decode = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

const text = (html: string) =>
	decode(html.replace(/<[^>]+>/g, ' '))
		.replace(/\s+/g, ' ')
		.trim();

// the signed config of the listing's sprig component
function componentConfig(page: string): string | null {
	for (const m of page.matchAll(/hx-vals="([^"]*)"/g)) {
		try {
			const config = (JSON.parse(decode(m[1])) as Record<string, unknown>)['sprig:config'];
			if (typeof config === 'string') return config;
		} catch {
			// another element's values
		}
	}
	return null;
}

function link(href: string): string | null {
	try {
		const url = new URL(decode(href).trim());
		return /^https?:$/.test(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

export const board: JobBoardScraper = {
	async list() {
		const page = await fetchWithRetry(PAGE);
		if (!page.ok) throw new Error(`${PAGE}: the page answered ${page.status}`);
		const config = componentConfig(await page.text());
		if (!config) throw new Error(`${PAGE}: the page carries no job listing component`);
		const params = new URLSearchParams({ 'sprig:config': config, offset: String(PAST_ALL_ROWS) });
		const resp = await fetchWithRetry(`${RENDER}?${params}`, { headers: { 'hx-request': 'true' } });
		if (!resp.ok) throw new Error(`${PAGE}: the job listing answered ${resp.status}`);
		const rows = (await resp.text()).match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
		const byKey = new Map<string, ScrapedJob>();
		for (const row of rows.split(/<tr>\s*(?=<td)/).slice(1)) {
			// the logo, the title, the day, the location, the link
			const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
			if (cells.length < 5) continue;
			const company = decode(cells[0].match(/alt="([^"]*?) logo"/)?.[1] ?? '').trim() || text(cells[0]);
			const title = text(cells[1]);
			const url = link(cells[4].match(/href="([^"]+)"/)?.[1] ?? '');
			if (!company || !title || !url || byKey.has(url)) continue;
			const day = cells[2].match(/datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
			byKey.set(url, {
				key: url,
				company,
				companyUrl: '',
				title,
				url,
				applyUrl: url,
				category: '',
				sector: '',
				location: [...cells[3].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
					.map((m) => text(m[1]))
					.filter(Boolean)
					.join('; '),
				salary: null,
				postedAt: day ? new Date(`${day}T00:00:00Z`) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${PAGE}: no job rows in the listing`);
		return [...byKey.values()];
	},

	detail(job) {
		return atsDetail(job.applyUrl);
	}
};
