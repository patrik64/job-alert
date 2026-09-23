// The nine rss feeds in one place: what each is called, how it narrows the
// night's newcomers, and the machinery that renders them all once — right
// after the nightly run — into stored rows the routes serve as they are.
// Rendering used to happen per request, and each render read the whole
// newcomer window off the database; the reads were most of its egress.

import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from './api';
import { feedResponse, recentNewcomers, type FeedJob } from './feed';
import {
	CPP_FEED,
	DEVOPS_FEED,
	GO_FEED,
	KOTLIN_FEED,
	PRODUCT_MANAGER_FEED,
	REACT_FEED,
	RUST_FEED,
	SVELTE_FEED,
	UX_FEED,
	rssFeed,
	WINDOW_DAYS,
	type FeedSpec
} from './rss';
import { describedIds, RUST, RUST_SQL } from '../shared/ScrapeController';
import { FeedRender } from '../shared/FeedRender';
import { Fund } from '../shared/Fund';

type Narrow = () => ((job: FeedJob) => boolean) | Promise<(job: FeedJob) => boolean>;

// the framework as a word, with or without its kit — once for js and once
// for the database's posix engine
const SVELTE = /\bsvelte(?:kit)?\b/i;
const SVELTE_SQL = '\\msvelte(kit)?\\M';

// the language as a word
const KOTLIN = /\bkotlin\b/i;
const KOTLIN_SQL = '\\mkotlin\\M';

// the framework as a word — react, react.js, reactjs, react native — in any
// case for a title or job function, where it can mean nothing else. A
// description holds prose, and react is also just an english verb ("react to
// incidents"), so there only the framework's proper name React counts — or
// the js/native forms, whose casing no verb ever wears
const REACT = /\breact(?:\.?js|[- ]native)?\b/i;
const REACT_DESCRIBED = /\bReact\b|\b[Rr]eact\.?[Jj][Ss]\b|\b[Rr]eact[- ][Nn]ative\b/;
const REACT_SQL = '\\mReact\\M|\\m[Rr]eact\\.?[Jj][Ss]\\M|\\m[Rr]eact[- ][Nn]ative\\M';

// the language as a word — "Go", "Go/Rust", "Backend Engineer (Go)" — or as
// golang, in a title or job function; the boards' many go-to-market roles
// and the odd go-getter are turned away by the lookahead. In prose only
// golang counts — go is the commonest of verbs there in any casing
const GO = /\bgolang\b|\bgo\b(?![ -]to[ -]market|[ -]getter)/i;
const GO_DESCRIBED = /\bgolang\b/i;
const GO_SQL = '\\mgolang\\M';

// the language written out ("C++", also mid-title as in "C/C++") or as the
// word cpp; a word boundary can't follow the pluses
const CPP = /\bc\+\+|\bcpp\b/i;

// jobs that say devops themselves, in the title or the board's job function;
// descriptions stay out of it — "works closely with our devops team" does
// not make a devops job
const DEVOPS = /\bdev[\s-]?ops\b/i;

// the trade as words in the title, and in the job function only the literal
// pair: the boards' Product Management tag also hangs on product marketing
// and production roles
const PM_TITLE = /\bproduct manage(?:r|ment)\b/i;
const PM_FUNCTION = /\bproduct manager\b/i;

// the trade in a title or job function — a trade is not a stack, so
// descriptions are never read: half the engineering postings promise close
// work with the ux team
const UX = /\bux\b|\buser experience\b|\bgraphics? design/i;

// what a feed is about: a pattern for the title and one for the board's job
// function, and — for the languages, which postings also name in their
// prose — a pattern the database runs over the stored descriptions (see
// describedIds). The feeds narrow the night's newcomers by these, and the
// jobs api filters its queries by them
export interface Topic {
	title: RegExp;
	category: RegExp;
	described?: { posix: string; substring: string; word: RegExp; exactCase?: boolean };
}

const trade = (re: RegExp): Topic => ({ title: re, category: re });
const language = (re: RegExp, posix: string, substring: string, word = re, exactCase = false): Topic => ({
	title: re,
	category: re,
	described: { posix, substring, word, exactCase }
});

export const TOPICS = {
	rust: language(RUST, RUST_SQL, 'rust'),
	svelte: language(SVELTE, SVELTE_SQL, 'svelte'),
	kotlin: language(KOTLIN, KOTLIN_SQL, 'kotlin'),
	react: language(REACT, REACT_SQL, 'react', REACT_DESCRIBED, true),
	go: language(GO, GO_SQL, 'golang', GO_DESCRIBED),
	cpp: trade(CPP),
	devops: trade(DEVOPS),
	'product-manager': { title: PM_TITLE, category: PM_FUNCTION },
	ux: trade(UX)
} satisfies Record<string, Topic>;
export type TopicName = keyof typeof TOPICS;

// a topic as a feed's narrowing: the title, the job function, or — where
// the topic reads them — the stored description
const narrowBy =
	({ title, category, described }: Topic): Narrow =>
	async () => {
		const ids = described
			? new Set(
					await describedIds(described.posix, described.substring, described.word, described.exactCase)
				)
			: undefined;
		return (job) =>
			title.test(job.title) || category.test(job.category) || !!ids?.has(job.detailKey);
	};

// whether a description is worth keeping at all: only the five language
// topics above ever read stored text, so enrichment stores a description
// only when one of their patterns speaks up
export const mentionsTrackedLanguage = (text: string) =>
	RUST.test(text) ||
	SVELTE.test(text) ||
	KOTLIN.test(text) ||
	GO_DESCRIBED.test(text) ||
	REACT_DESCRIBED.test(text);

export const FEEDS: { slug: string; spec: FeedSpec; narrow: Narrow }[] = [
	{ slug: 'rss-rust', spec: RUST_FEED, narrow: narrowBy(TOPICS.rust) },
	{ slug: 'rss-svelte', spec: SVELTE_FEED, narrow: narrowBy(TOPICS.svelte) },
	{ slug: 'rss-kotlin', spec: KOTLIN_FEED, narrow: narrowBy(TOPICS.kotlin) },
	{ slug: 'rss-react', spec: REACT_FEED, narrow: narrowBy(TOPICS.react) },
	{ slug: 'rss-go', spec: GO_FEED, narrow: narrowBy(TOPICS.go) },
	{ slug: 'rss-cpp', spec: CPP_FEED, narrow: narrowBy(TOPICS.cpp) },
	{ slug: 'rss-devops', spec: DEVOPS_FEED, narrow: narrowBy(TOPICS.devops) },
	{
		slug: 'rss-product-manager',
		spec: PRODUCT_MANAGER_FEED,
		narrow: narrowBy(TOPICS['product-manager'])
	},
	{ slug: 'rss-ux', spec: UX_FEED, narrow: narrowBy(TOPICS.ux) }
];

// render every feed from one reading of the newcomer window and store the
// results — called by the nightly run once its fetches are done, so the
// freshest night is complete and stays in (settled)
export async function renderAllFeeds(): Promise<number> {
	const now = new Date();
	const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
	const [jobs, funds] = await Promise.all([
		recentNewcomers(since),
		repo(Fund).find({ limit: 1000 })
	]);
	const latestFetch = funds.reduce<Date | undefined>(
		(latest, f) =>
			f.lastFetchedAt && (!latest || f.lastFetchedAt > latest) ? f.lastFetchedAt : latest,
		undefined
	);
	const renders = repo(FeedRender);
	for (const { slug, spec, narrow } of FEEDS) {
		const match = await narrow();
		const rows = jobs.flatMap((j) =>
			match(j)
				? [
						{
							fundSlug: j.fundSlug,
							company: j.company,
							title: j.title,
							url: j.url,
							firstSeenAt: j.firstSeenAt
						}
					]
				: []
		);
		const xml = rssFeed(rows, latestFetch, now, spec, true);
		await renders.upsert({ where: { id: slug }, set: { xml, renderedAt: now } });
	}
	return FEEDS.length;
}

// what the feed routes serve: the stored rendering, straight through. A feed
// never rendered yet — a fresh database — falls back to rendering live once
export async function storedFeedResponse(event: RequestEvent, slug: string): Promise<Response> {
	const feed = FEEDS.find((f) => f.slug === slug);
	if (!feed) return new Response('Not found', { status: 404 });
	const stored = await api.withRemult(event, () =>
		repo(FeedRender).findId(slug, { useCache: false })
	);
	if (!stored) return feedResponse(event, feed.spec, feed.narrow);
	return new Response(stored.xml, {
		headers: {
			// browsers render plain xml as a document tree, while the feed's own
			// media type gets them offering a download; readers accept either
			'Content-Type': 'application/xml; charset=utf-8',
			// the rendering changes once a day; the cdn keeps it for hours where
			// readers ask in minutes
			'Cache-Control': 'public, max-age=0, s-maxage=14400, stale-while-revalidate=86400'
		}
	});
}
