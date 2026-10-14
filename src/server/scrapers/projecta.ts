import { flightText } from './considernext';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Project A's careers page — a next.js site over the fund's greenhouse
// account, listing its own openings and, under "Roles at portfolio
// companies", the roles it recruits for its companies. Each row links a page
// of the site's own (/careers/<greenhouse id>) and names the title, the
// company, the category and the place; the job's page carries the
// description as html in its server payload.

const PAGE = 'https://www.project-a.vc/careers';
const NOT_A_JOB = /\bopen application\b|\bunsolicited application\b/i;

// a string of the payload, its escapes undone
const unquote = (s: string) => JSON.parse(`"${s}"`) as string;

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(PAGE);
		if (!resp.ok) throw new Error(`${PAGE}: the page answered ${resp.status}`);
		const flight = flightText(await resp.text());
		const rows = [
			...flight.matchAll(/\["\$","a","\d+,(\d+)",\{"href":"(https:\/\/www\.project-a\.vc\/careers\/\d+)"/g)
		];
		const byKey = new Map<string, ScrapedJob>();
		rows.forEach((m, i) => {
			const [, id, url] = m;
			if (byKey.has(id)) return;
			const row = flight.slice(m.index, rows[i + 1]?.index ?? m.index + 6000);
			const title = row.match(/\["\$","h4",null,\{[^{}]*?"children":"((?:[^"\\]|\\.)*)"/)?.[1];
			// the company, then the category, as plain text cells
			const cells = [...row.matchAll(/"className":"textStyle_body\.regular[^"]*","children":"((?:[^"\\]|\\.)*)"/g)];
			if (!title || NOT_A_JOB.test(unquote(title))) return;
			byKey.set(id, {
				key: id,
				company: cells[0] ? unquote(cells[0][1]).trim() : 'Project A',
				companyUrl: '',
				title: unquote(title).trim(),
				url,
				applyUrl: url,
				category: row.match(/"data-category":"((?:[^"\\]|\\.)*)"/)?.[1]?.trim() ?? '',
				sector: '',
				location: row.match(/"data-location":"((?:[^"\\]|\\.)*)"/)?.[1]?.trim() ?? '',
				salary: null,
				postedAt: null
			});
		});
		if (byKey.size === 0) throw new Error(`${PAGE}: no job rows in the page's data`);
		return [...byKey.values()];
	},

	async detail(job) {
		const resp = await fetchWithRetry(job.url);
		if (resp.status === 404) return null;
		if (!resp.ok) throw new Error(`${job.url}: the job's page answered ${resp.status}`);
		const flight = flightText(await resp.text());
		// the description is the payload's longest text row of html — a row
		// "<id>:T<byte length in hex>," followed by that many bytes of text
		let description = '';
		for (const m of flight.matchAll(/(?:^|\n)[0-9a-f]+:T([0-9a-f]+),/g)) {
			const bytes = Buffer.from(flight.slice(m.index + m[0].length), 'utf8');
			const text = bytes.subarray(0, parseInt(m[1], 16)).toString('utf8');
			if (text.length > description.length && /<(?:p|h2|ul)\b/.test(text)) description = text;
		}
		return description ? { description } : null;
	}
};
