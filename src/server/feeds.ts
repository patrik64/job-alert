// The nine rss feeds in one place: what each is called, which of the
// window's newcomers it names, and the machinery that renders them all once —
// right after the nightly run — into stored rows the routes serve as they
// are. Rendering used to happen per request, and each render read the whole
// newcomer window off the database; the reads were most of its egress. Now
// the database hands over only the jobs a feed's words turn up, over the
// whole window, and each feed's patterns judge them.

import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from './api';
import { feedResponse, latestFetchOf, newcomersLike, type FeedJob } from './feed';
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
import { describedIds, inTextRe, RUST, RUST_SQL } from '../shared/ScrapeController';
import { FeedRender } from '../shared/FeedRender';
import { Fund } from '../shared/Fund';

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

// the start of a title about software work — where a bare "go" or "cpp" can
// be the language
const SOFTWARE_TITLE =
	'^(?=.*(?:engineer|developer|programmer|software|back[\\s-]?end|architect|infrastructure|devops|\\b(?:sre|sde|tech)\\b)).*';

// the language, in a title or job function: golang anywhere, and go where a
// title names a language — "(Go)", "(Go, Java)", "Go/Rust", "Python & GO",
// "- Go", "PHP or Go" — or stands beside the role ("Go Software Engineer",
// "Senior Go Engineer", "Backend Developer GO"), in a title about software
// work. Anywhere else the word is a name — "Vinted Go", "MONOPOLY GO!",
// "Pokémon GO Platform", "Go.Compare", the Brazilian state — or go-to-market
// and go-live. In prose only golang counts — go is the commonest of verbs
// there in any casing
const GO = new RegExp(
	'\\bgolang\\b|' +
		SOFTWARE_TITLE +
		// after an opening bracket, a list separator or a dash, or after a
		// connecting, seniority or role word
		'(?<=(?:^|[(\\[,/&+|:;]|\\s[-–—])\\s*|\\b(?:or|and|in|with|senior|sr\\.?|staff|lead|principal|junior|jr\\.?|mid|head|experienced|remote|freelance|back[\\s-]?end|stack|engineers?|developers?|programmers?)\\s+)go' +
		// before a closing bracket, a list separator or the end, or before a
		// connecting or role word
		'(?=\\s*(?:$|[)\\],/&+|:;])|\\s+(?:or|and|engineers?|engineering|developers?|devs?|programmers?|software|back[\\s-]?end|expert|specialist|consultant|architect|sre|senior|staff|lead|principal)\\b)',
	'i'
);
const GO_DESCRIBED = /\bgolang\b/i;
const GO_SQL = '\\mgolang\\M';

// the language written out ("C++", also mid-title as in "C/C++") — a word
// boundary can't follow the pluses — or as the word cpp in a title about
// software work: on its own cpp is as soon a hospital unit, a pension plan
// or a payroll certificate ("CPP/Transfer Center RN Supervisor")
const CPP = new RegExp('\\bc\\+\\+|' + SOFTWARE_TITLE + '\\bcpp\\b', 'i');

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
// describedIds). The feeds judge the window's newcomers by these, and the
// jobs api filters its queries by them. The like patterns are how the
// database finds the candidates to judge: every job the title or function
// pattern takes holds one of them, in some case
export interface Topic {
	title: RegExp;
	category: RegExp;
	described?: { posix: string; substring: string; word: RegExp; exactCase?: boolean };
	like: string[];
}

const trade = (re: RegExp, like: string[]): Topic => ({ title: re, category: re, like });
const language = (
	re: RegExp,
	like: string,
	posix: string,
	substring: string,
	word = re,
	exactCase = false
): Topic => ({
	title: re,
	category: re,
	described: { posix, substring, word, exactCase },
	like: [`%${like}%`]
});

export const TOPICS = {
	rust: language(RUST, 'rust', RUST_SQL, 'rust'),
	svelte: language(SVELTE, 'svelte', SVELTE_SQL, 'svelte'),
	kotlin: language(KOTLIN, 'kotlin', KOTLIN_SQL, 'kotlin'),
	react: language(REACT, 'react', REACT_SQL, 'react', REACT_DESCRIBED, true),
	go: language(GO, 'go', GO_SQL, 'golang', GO_DESCRIBED),
	cpp: trade(CPP, ['%c++%', '%cpp%']),
	// the one character stands for the space or hyphen the pattern allows
	devops: trade(DEVOPS, ['%devops%', '%dev_ops%']),
	'product-manager': { title: PM_TITLE, category: PM_FUNCTION, like: ['%product manage%'] },
	ux: trade(UX, ['%ux%', '%user experience%', '%graphic design%', '%graphics design%'])
} satisfies Record<string, Topic>;
export type TopicName = keyof typeof TOPICS;

// a topic's pattern in postgres's dialect, where a word boundary is \y, and
// the operator that matches it
export const posix = (re: RegExp) => re.source.replaceAll('\\b', '\\y');
export const operator = (re: RegExp) => (re.flags.includes('i') ? '~*' : '~');

// a topic ready to judge jobs: the stored descriptions its pattern finds (by
// posting key), and the test — the title, the job function, or one of those
// descriptions
async function readTopic({ title, category, described }: Topic) {
	const detailKeys = described
		? await describedIds(described.posix, described.substring, described.word, described.exactCase)
		: [];
	const mentioned = new Set(detailKeys);
	return {
		detailKeys,
		match: (job: FeedJob) =>
			title.test(job.title) || category.test(job.category) || mentioned.has(job.detailKey)
	};
}

// a topic's newcomers of the window
async function topicNewcomers(topic: Topic, since: Date): Promise<FeedJob[]> {
	const { detailKeys, match } = await readTopic(topic);
	return (await newcomersLike(since, { like: topic.like, detailKeys })).filter(match);
}

// whether a description is worth keeping at all: only the five language
// topics above ever read stored text, so enrichment stores a description
// only when one of their patterns speaks up — in its text, not its markup
// (see inText)
const DESCRIBED_LANGUAGES = [RUST, SVELTE, KOTLIN, GO_DESCRIBED, REACT_DESCRIBED].map(inTextRe);
export const mentionsTrackedLanguage = (text: string) =>
	DESCRIBED_LANGUAGES.some((re) => re.test(text));

export const FEEDS: { slug: string; spec: FeedSpec; topic: Topic }[] = [
	{ slug: 'rss-rust', spec: RUST_FEED, topic: TOPICS.rust },
	{ slug: 'rss-svelte', spec: SVELTE_FEED, topic: TOPICS.svelte },
	{ slug: 'rss-kotlin', spec: KOTLIN_FEED, topic: TOPICS.kotlin },
	{ slug: 'rss-react', spec: REACT_FEED, topic: TOPICS.react },
	{ slug: 'rss-go', spec: GO_FEED, topic: TOPICS.go },
	{ slug: 'rss-cpp', spec: CPP_FEED, topic: TOPICS.cpp },
	{ slug: 'rss-devops', spec: DEVOPS_FEED, topic: TOPICS.devops },
	{ slug: 'rss-product-manager', spec: PRODUCT_MANAGER_FEED, topic: TOPICS['product-manager'] },
	{ slug: 'rss-ux', spec: UX_FEED, topic: TOPICS.ux }
];

// render every feed and store the results — called by the nightly run once its
// fetches are done, so the freshest night is complete and stays in (settled).
// One reading serves them all: the database hands over every job any feed's
// words or descriptions turn up, over the whole window, and each feed keeps
// what its own patterns take
export async function renderAllFeeds(): Promise<number> {
	const now = new Date();
	const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
	const readers = [];
	for (const feed of FEEDS) readers.push({ ...feed, ...(await readTopic(feed.topic)) });
	const [jobs, funds] = await Promise.all([
		newcomersLike(since, {
			like: [...new Set(FEEDS.flatMap((f) => f.topic.like))],
			detailKeys: [...new Set(readers.flatMap((r) => r.detailKeys))]
		}),
		repo(Fund).find({ limit: 1000 })
	]);
	const latestFetch = latestFetchOf(funds);
	const renders = repo(FeedRender);
	for (const { slug, spec, match } of readers) {
		const xml = rssFeed(jobs.filter(match), latestFetch, now, spec, true);
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
	if (!stored) return feedResponse(event, feed.spec, (since) => topicNewcomers(feed.topic, since));
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
