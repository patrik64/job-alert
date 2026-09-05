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

// a title-and-function matcher; the language feeds add the described ids
const inText = (re: RegExp) => () => (job: FeedJob) => re.test(job.title) || re.test(job.category);

const withDescribed =
	(re: RegExp, posix: string, substring: string, word: RegExp, exactCase = false): Narrow =>
	async () => {
		const described = new Set(await describedIds(posix, substring, word, exactCase));
		return (job) => re.test(job.title) || re.test(job.category) || described.has(job.id);
	};

export const FEEDS: { slug: string; spec: FeedSpec; narrow: Narrow }[] = [
	{ slug: 'rss-rust', spec: RUST_FEED, narrow: withDescribed(RUST, RUST_SQL, 'rust', RUST) },
	{
		slug: 'rss-svelte',
		spec: SVELTE_FEED,
		narrow: withDescribed(SVELTE, SVELTE_SQL, 'svelte', SVELTE)
	},
	{
		slug: 'rss-kotlin',
		spec: KOTLIN_FEED,
		narrow: withDescribed(KOTLIN, KOTLIN_SQL, 'kotlin', KOTLIN)
	},
	{
		slug: 'rss-react',
		spec: REACT_FEED,
		narrow: withDescribed(REACT, REACT_SQL, 'react', REACT_DESCRIBED, true)
	},
	{ slug: 'rss-go', spec: GO_FEED, narrow: withDescribed(GO, GO_SQL, 'golang', GO_DESCRIBED) },
	{ slug: 'rss-cpp', spec: CPP_FEED, narrow: inText(CPP) },
	{ slug: 'rss-devops', spec: DEVOPS_FEED, narrow: inText(DEVOPS) },
	{
		slug: 'rss-product-manager',
		spec: PRODUCT_MANAGER_FEED,
		narrow: () => (job) => PM_TITLE.test(job.title) || PM_FUNCTION.test(job.category)
	},
	{ slug: 'rss-ux', spec: UX_FEED, narrow: inText(UX) }
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
