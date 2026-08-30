// The newcomer digest feeds: one item per night that turned up new jobs, with
// the night's headline as the title and the jobs named under their funds, each
// linking to its page on the board. A night on boards this size can run to
// thousands of jobs, so a fund's line names the first few dozen and counts
// the rest. Every feed is narrowed to one trade or language (devops, rust,
// go, c++, svelte, product manager) — an unnarrowed feed of such nights
// would be unreadable.

import { FUNDS } from '../shared/funds';
import { LIVE_URL, SITE_NAME } from '../shared/site';

// feed readers key items by these urls, so they must not depend on which host
// served the request
export const SITE_URL = LIVE_URL;
// nights are told apart by the calendar day in the timezone the nightly job
// keeps (it runs at 4am in Berlin)
export const TIME_ZONE = 'Europe/Berlin';
// how far back the feed reaches at most, at most how many nights it carries,
// and how many jobs a fund's line names before it counts the rest
export const WINDOW_DAYS = 30;
const MAX_ITEMS = 30;
const MAX_PER_FUND = 30;
// a fetch lands its newcomers over a few seconds and the nightly run keeps
// going for minutes, so a night this fresh is still being written: it stays
// out of the feed until it has settled, because a reader that caches a
// half-written entry may never show the rest of it
const QUIET_MS = 20 * 60_000;

const clock = new Intl.DateTimeFormat('en', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	hourCycle: 'h23'
});
const inBerlin = (d: Date) =>
	Object.fromEntries(clock.formatToParts(d).map((p) => [p.type, p.value]));

// YYYY-MM-DD in Berlin
export const dayKey = (d: Date) => {
	const t = inBerlin(d);
	return `${t.year}-${t.month}-${t.day}`;
};

export interface FeedRow {
	fundSlug: string;
	company: string;
	title: string;
	url: string;
	firstSeenAt: Date;
}

// what tells one feed from the other: its own url, channel title and
// description, and the wording of a night's headline
export interface FeedSpec {
	url: string;
	title: string;
	description: string;
	headline: (n: number) => string;
}

export const DEVOPS_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-devops.xml`,
	title: `${SITE_NAME} — devops`,
	description:
		`New devops jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new devops ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const RUST_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-rust.xml`,
	title: `${SITE_NAME} — rust`,
	description:
		`New rust jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new rust ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const CPP_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-cpp.xml`,
	title: `${SITE_NAME} — c++`,
	description:
		`New c++ jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new c++ ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const GO_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-go.xml`,
	title: `${SITE_NAME} — go`,
	description:
		`New go jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new go ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const SVELTE_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-svelte.xml`,
	title: `${SITE_NAME} — svelte`,
	description:
		`New svelte jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new svelte ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const REACT_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-react.xml`,
	title: `${SITE_NAME} — react`,
	description:
		`New react jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new react ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const KOTLIN_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-kotlin.xml`,
	title: `${SITE_NAME} — kotlin`,
	description:
		`New kotlin jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new kotlin ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

export const PRODUCT_MANAGER_FEED: FeedSpec = {
	url: `${SITE_URL}/rss-product-manager.xml`,
	title: `${SITE_NAME} — product manager`,
	description:
		`New product manager jobs at the portfolio companies of ${FUNDS.length} venture capital funds: ` +
		'one item per night that found some.',
	headline: (n) => `${n} new product manager ${n === 1 ? 'job' : 'jobs'} at vc-backed companies`
};

const ENTITIES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]);

function groupBy<T>(items: T[], key: (item: T) => string) {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = groups.get(k);
		if (list) list.push(item);
		else groups.set(k, [item]);
	}
	return groups;
}

// a night's finds, fund by fund — the loudest funds first, as on bluesky
const describe = (rows: FeedRow[]) => {
	const names = new Map(FUNDS.map((f) => [f.slug, f.name]));
	return [...groupBy(rows, (r) => r.fundSlug)]
		.map(([slug, jobs]) => ({
			slug,
			name: names.get(slug) ?? slug,
			jobs: [...jobs].sort(
				(a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title)
			)
		}))
		.sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name))
		.map((g) => {
			const named = g.jobs.slice(0, MAX_PER_FUND).map((j) => {
				const label = escape(`${j.company} – ${j.title}`);
				return j.url.startsWith('http') ? `<a href="${escape(j.url)}">${label}</a>` : label;
			});
			const rest = g.jobs.length - named.length;
			const more = rest > 0 ? `, and ${rest} more` : '';
			return `<p><a href="${SITE_URL}/funds/${g.slug}">${escape(g.name)}</a> (${g.jobs.length}): ${named.join(', ')}${more}</p>`;
		})
		.join('\n');
};

// rows are the genuine newcomers (no baseline imports), newest first;
// latestFetch is when any fund was last refreshed successfully
export function rssFeed(
	rows: FeedRow[],
	latestFetch: Date | undefined,
	now = new Date(),
	feed: FeedSpec
) {
	const byDay = groupBy(rows, (r) => dayKey(r.firstSeenAt));
	const latest = Math.max(rows[0]?.firstSeenAt.getTime() ?? 0, latestFetch?.getTime() ?? 0);
	if (latest && now.getTime() - latest < QUIET_MS) byDay.delete(dayKey(new Date(latest)));

	const nights = [...byDay].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, MAX_ITEMS);
	const items = nights.map(([day, rows]) => {
		const link = `${SITE_URL}/timeline#${day}`;
		return [
			'<item>',
			`<title>${escape(feed.headline(rows.length))}</title>`,
			`<link>${link}</link>`,
			`<guid>${link}</guid>`,
			// when the night's last newcomer landed
			`<pubDate>${rows[0].firstSeenAt.toUTCString()}</pubDate>`,
			`<description>${escape(describe(rows))}</description>`,
			'</item>'
		].join('\n');
	});

	const updated = nights.length
		? `<lastBuildDate>${nights[0][1][0].firstSeenAt.toUTCString()}</lastBuildDate>\n`
		: '';

	return (
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
		`<channel>\n` +
		`<title>${escape(feed.title)}</title>\n` +
		`<link>${SITE_URL}/</link>\n` +
		`<atom:link href="${feed.url}" rel="self" type="application/rss+xml"/>\n` +
		`<description>${escape(feed.description)}</description>\n` +
		`<language>en</language>\n` +
		updated +
		items.join('\n') +
		(items.length ? '\n' : '') +
		`</channel>\n` +
		`</rss>\n`
	);
}
