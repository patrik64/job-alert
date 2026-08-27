import { atsDetail } from './ats';
import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// Underline Ventures curates its jobs page by hand on its Framer site: the
// whole list ships server-rendered (the "Load More" button is decoration),
// each job a card of five text lines — title, company, a summary paragraph,
// the posting date and the location — closed by a "Read More" link straight
// to the posting. The cards carry no ids, so the posting's url stands in as
// the key, and the summary paragraph stands in as the description when the
// posting's applicant tracking system offers nothing fuller.

const BOARD_URL = 'https://underline.vc/jobs';

// a card's closing link: the only external links wrapping "Read More"
const CARD_ANCHOR = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>(?:(?!<\/a>).)*?Read More/gis;

// tags become line breaks; an attribute value holding a '>' leaks its tail as
// a stray line of punctuation, so only lines with a word in them count
const textLines = (html: string) =>
	html
		.replace(/<!--.*?-->/gs, ' ')
		.replace(/<(script|style)[^>]*>.*?<\/\1>/gis, ' ')
		.replace(/<[^>]+>/g, '\n')
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => /[a-z0-9]/i.test(s));

interface Card {
	href: string;
	title: string;
	company: string;
	summary: string;
	postedAt: Date;
	location: string;
}

function parseCards(html: string): Card[] {
	const cards = new Map<string, Card>();
	let from = 0;
	for (const m of html.matchAll(CARD_ANCHOR)) {
		const lines = textLines(html.slice(from, m.index));
		from = m.index + m[0].length;
		const href = m[1];
		// the page repeats every card for each responsive variant
		if (cards.has(href)) continue;
		const [title, company, summary, posted, location] = lines.slice(-5);
		const postedAt = new Date(posted ?? '');
		if (!title || !company || !location || Number.isNaN(postedAt.getTime())) {
			throw new Error(`${BOARD_URL}: could not read the card linking ${href}`);
		}
		cards.set(href, { href, title, company, summary: summary ?? '', postedAt, location });
	}
	if (cards.size === 0) throw new Error(`${BOARD_URL}: the board lists no jobs`);
	return [...cards.values()];
}

// one small page serves the listing and every summary; read it once and keep
// it for a while so an enrichment pass does not fetch it per job
const CACHE_MS = 5 * 60_000;
let cached: { at: number; cards: Promise<Card[]> } | null = null;

function boardCards(): Promise<Card[]> {
	if (!cached || Date.now() - cached.at > CACHE_MS) {
		const cards = (async () => {
			const resp = await fetchWithRetry(BOARD_URL);
			if (!resp.ok) throw new Error(`${BOARD_URL}: answered ${resp.status}`);
			return parseCards(await resp.text());
		})();
		cards.catch(() => (cached = null));
		cached = { at: Date.now(), cards };
	}
	return cached.cards;
}

function toJob(c: Card): ScrapedJob {
	return {
		key: c.href.replace(/^https?:\/\//, ''),
		company: c.company,
		// no company pages on the board — its jobs page stands in
		companyUrl: BOARD_URL,
		title: c.title,
		// no job pages either: the card links straight to the posting
		url: c.href,
		applyUrl: c.href,
		category: '',
		sector: '',
		location: c.location,
		salary: null,
		postedAt: c.postedAt
	};
}

export const board: JobBoardScraper = {
	async list() {
		return (await boardCards()).map(toJob);
	},

	async detail({ applyUrl }): Promise<ScrapedJobDetail | null> {
		const ats = await atsDetail(applyUrl);
		if (ats) return ats;
		const card = (await boardCards()).find((c) => c.href === applyUrl);
		return card?.summary ? { description: card.summary } : null;
	}
};
