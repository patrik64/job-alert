import { fetchJson } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// Breega's job board — a teamtailor career site listing the fund's own
// openings beside those at its portfolio companies, the company named in the
// title ("Sales & Marketing Ops - @Ensol", "PIC Engineer @InSpek"). The
// site's json feed carries every opening with its schema.org posting —
// description, place and day included — so one request lists the board,
// and the same feed, kept for a few minutes, serves the descriptions. The
// open application is no job and stays out.

const FEED = 'https://jobs.breega.com/jobs.json';
const OWNER = 'Breega';
const FEED_TTL_MS = 10 * 60_000;
const NOT_A_JOB = /\b(?:spontaneous|unsolicited) application\b|\bcandidature spontan/i;

interface Posting {
	description?: string | null;
	datePosted?: string | null;
	jobLocation?: { address?: { addressLocality?: string | null; addressCountry?: string | null } }[] | null;
}

interface FeedItem {
	title?: string | null;
	url?: string | null;
	date_published?: string | null;
	_jobposting?: Posting | null;
}

let feed: { items: Promise<FeedItem[]>; readAt: number } | undefined;

function readFeed(): Promise<FeedItem[]> {
	if (feed && Date.now() - feed.readAt < FEED_TTL_MS) return feed.items;
	const items = fetchJson<{ items?: FeedItem[] }>(FEED, { headers: { accept: 'application/json' } }).then(
		(data) => data.items ?? []
	);
	feed = { items, readAt: Date.now() };
	// a failed read is not kept
	items.catch(() => (feed = undefined));
	return items;
}

// "Role - @Company" and "Role @Company"; a title without one is the fund's
const companyOf = (title: string) => {
	const m = title.match(/^(.*?)\s*(?:-\s*)?@\s*([^@]+?)\s*$/);
	return m && m[1] ? { title: m[1].trim(), company: m[2] } : { title, company: OWNER };
};

const placeOf = (posting: Posting | null | undefined) =>
	[
		...new Set(
			(posting?.jobLocation ?? []).map((place) =>
				[place.address?.addressLocality, place.address?.addressCountry].filter(Boolean).join(', ')
			)
		)
	]
		.filter(Boolean)
		.join('; ');

export const board: JobBoardScraper = {
	async list() {
		const jobs: ScrapedJob[] = [];
		for (const item of await readFeed()) {
			const url = item.url ?? '';
			const id = url.match(/\/jobs\/(\d+)/)?.[1];
			const heading = (item.title ?? '').trim();
			if (!id || !heading || NOT_A_JOB.test(heading)) continue;
			const { title, company } = companyOf(heading);
			const posted = item._jobposting?.datePosted ?? item.date_published;
			jobs.push({
				key: id,
				company,
				companyUrl: '',
				title,
				url,
				applyUrl: url,
				category: '',
				sector: '',
				location: placeOf(item._jobposting),
				salary: null,
				postedAt: posted ? new Date(posted) : null
			});
		}
		if (jobs.length === 0) throw new Error(`${FEED}: the feed lists no jobs`);
		return jobs;
	},

	async detail(job) {
		const item = (await readFeed()).find((i) => i.url === job.url);
		const description = item?._jobposting?.description;
		return description ? { description } : null;
	}
};
