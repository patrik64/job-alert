import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Female Founder Collective's job board — roles at women-led companies in
// its community, not a portfolio. It is a TanStack Start app built on
// lovable: the page renders the whole list on the server and hands the same
// jobs to the browser as a serialized object — id, company, title,
// industry, location, work mode, employment type, the full description, an
// apply link (mostly a mailto, a form or an airtable page) and the posting
// time. The strings there are javascript literals; they are decoded here,
// never evaluated. Descriptions come with the list, so a job's detail is
// read off a short-lived copy of it.

const BASE = 'https://ffcjobboard.lovable.app';
const LIST_TTL_MS = 10 * 60_000;

interface FfcJob {
	id: string;
	companyName?: string;
	title?: string;
	industry?: string;
	location?: string;
	remoteType?: string;
	employmentType?: string;
	description?: string;
	applyUrl?: string;
	postedAt?: string;
}

// a double-quoted javascript string literal's contents, unescaped
const ESCAPES: Record<string, string> = {
	n: '\n',
	r: '\r',
	t: '\t',
	b: '\b',
	f: '\f',
	v: '\v',
	0: '\0',
	'\n': ''
};
const decodeLiteral = (body: string) =>
	body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) =>
		e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : (ESCAPES[e] ?? e)
	);

// the flat objects of the serialized page data whose fields are all plain
// values; the jobs among them carry an id, a title and a company
const VALUE = String.raw`(?:"(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|null|void 0|!0|!1|true|false)`;
const OBJECT = new RegExp(String.raw`\{(?:\w+:${VALUE},?)+\}`, 'g');
const FIELD = new RegExp(String.raw`(\w+):(${VALUE})`, 'g');

async function listAll(): Promise<Map<string, FfcJob>> {
	const resp = await fetchWithRetry(`${BASE}/`);
	if (!resp.ok) throw new Error(`${BASE}: the page answered ${resp.status}`);
	const html = await resp.text();
	const byId = new Map<string, FfcJob>();
	for (const [object] of html.matchAll(OBJECT)) {
		const job: Record<string, string> = {};
		for (const [, name, value] of object.matchAll(FIELD))
			if (value.startsWith('"')) job[name] = decodeLiteral(value.slice(1, -1));
		if (job.id && job.title && job.companyName) byId.set(job.id, job as unknown as FfcJob);
	}
	if (byId.size === 0) throw new Error(`${BASE}: no jobs in the page's data`);
	return byId;
}

let cached: { at: number; jobs: Promise<Map<string, FfcJob>> } | undefined;

function boardJobs(): Promise<Map<string, FfcJob>> {
	if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.jobs;
	const fresh = { at: Date.now(), jobs: listAll() };
	cached = fresh;
	fresh.jobs.catch(() => {
		if (cached === fresh) cached = undefined;
	});
	return fresh.jobs;
}

// the posting's own link, its "mailto:" said once however often the board
// repeats it
const applyLink = (url: string) => url.trim().replace(/^(?:mailto:)+/i, 'mailto:');

export const board: JobBoardScraper = {
	async list() {
		return [...(await boardJobs()).values()].map((j): ScrapedJob => {
			const location = (j.location ?? '').trim();
			// the work mode is said once, even when the location already says it
			const mode = /remote|hybrid/i.test(location)
				? ''
				: /^remote$/i.test(j.remoteType ?? '')
					? 'remote'
					: /^hybrid$/i.test(j.remoteType ?? '')
						? 'hybrid'
						: '';
			const postedAt = j.postedAt ? new Date(j.postedAt) : null;
			return {
				key: j.id,
				company: j.companyName ?? '',
				companyUrl: '',
				title: j.title ?? '',
				url: `${BASE}/jobs/${encodeURIComponent(j.id)}`,
				applyUrl: applyLink(j.applyUrl ?? ''),
				category: '',
				sector: j.industry ?? '',
				location: [location, mode].filter(Boolean).join(' · '),
				salary: null,
				postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null
			};
		});
	},

	async detail(job) {
		const found = job.key ? (await boardJobs()).get(job.key) : undefined;
		if (!found) return null;
		return { description: found.description ?? '' };
	}
};
