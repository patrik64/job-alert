import { fetchWithRetry } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';

// TSVC curates its jobs page by hand in a Webflow collection: each job is a
// listitem card holding an "«Title» at «Company»" heading and a rich-text body
// — the description, a Location/Type line or two, and usually an apply link
// (an lnkd.in short link, once a mailto; one card has none at all). There are
// no ids, job pages or dates, so the heading stands in as the key, the board
// page (with the key as a fragment) as the job's url, and the card's body as
// the description.

const BOARD_URL = 'https://www.tsvcap.com/jobs';

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");

const textLines = (html: string) =>
	decode(html.replace(/<[^>]+>/g, '\n'))
		.split('\n')
		.map((s) => s.trim())
		.filter((s) => /[a-z0-9]/i.test(s));

interface Card {
	key: string;
	title: string;
	company: string;
	location: string;
	applyUrl: string;
	body: string;
}

function parseCards(html: string): Card[] {
	const cards: Card[] = [];
	for (const chunk of html.split(/<div[^>]+role="listitem"/).slice(1)) {
		const heading = decode(
			(chunk.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? '').replace(/<[^>]+>/g, '').trim()
		);
		// the heading names the role and the company in one breath
		const at = heading.lastIndexOf(' at ');
		// the card's body carries no divs, so the first closer ends it
		const body = chunk.match(/<div class="w-richtext">(.*?)<\/div>/s)?.[1] ?? '';
		if (at < 1 || !body) throw new Error(`${BOARD_URL}: could not read the card "${heading}"`);
		const lines = textLines(body);
		const where = lines.findIndex((s) => /^Location:?/i.test(s));
		const location =
			where < 0 ? '' : (lines[where].replace(/^Location:?\s*/i, '') || lines[where + 1] || '').trim();
		const links = [...body.matchAll(/href="((?:https?|mailto):[^"]+)"/g)];
		cards.push({
			key: heading
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, ''),
			title: heading.slice(0, at),
			company: heading.slice(at + 4),
			location,
			// the closing "Apply here" link — the last one the card holds
			applyUrl: links.at(-1)?.[1] ?? BOARD_URL,
			body
		});
	}
	if (cards.length === 0) throw new Error(`${BOARD_URL}: the board lists no jobs`);
	return cards;
}

// one small page serves the listing and every description; read it once and
// keep it for a while so an enrichment pass does not fetch it per job
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
		key: c.key,
		company: c.company,
		// no company pages on the board — its jobs page stands in
		companyUrl: BOARD_URL,
		title: c.title,
		// no job pages either: the fragment keeps the url one-per-job
		url: `${BOARD_URL}#${c.key}`,
		applyUrl: c.applyUrl,
		category: '',
		sector: '',
		location: c.location,
		salary: null,
		postedAt: null
	};
}

export const board: JobBoardScraper = {
	async list() {
		return (await boardCards()).map(toJob);
	},

	async detail({ url }): Promise<ScrapedJobDetail | null> {
		const key = url.split('#')[1];
		const card = (await boardCards()).find((c) => c.key === key);
		return card ? { description: card.body } : null;
	}
};
