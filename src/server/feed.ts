// The reader behind the rss feeds — the window's newcomers a feed could name —
// and the response that renders one feed on the spot.

import type { RequestEvent } from '@sveltejs/kit';
import { remult, repo, SqlDatabase } from 'remult';
import { api } from './api';
import { rssFeed, WINDOW_DAYS, type FeedSpec } from './rss';
import { Fund } from '../shared/Fund';
import { Job } from '../shared/Job';

// what a feed reads of a job: the digest line's fields, plus the two the
// narrowed feeds judge by
export interface FeedJob {
	id: string;
	fundSlug: string;
	company: string;
	title: string;
	url: string;
	category: string;
	// the posting's key — descriptions are stored under it (see Job.detailKey)
	detailKey: string;
	firstSeenAt: Date;
}

// what the database looks for: a job whose title or job function holds one of
// the like patterns (in any case), or whose posting's stored description is
// among the detail keys
export interface FeedCandidates {
	like: string[];
	detailKeys: string[];
}

// a like pattern as a javascript test, for the json fallback
const likeTest = (pattern: string) =>
	new RegExp(
		`^${[...pattern]
			.map((ch) => (ch === '%' ? '[\\s\\S]*' : ch === '_' ? '[\\s\\S]' : ch.replace(/[\\^$.*+?()[\]{}|]/, '\\$&')))
			.join('')}$`,
		'i'
	);

// the window's newcomers that could belong to a feed, newest first, over the
// whole window — as the few columns above: the words keep the scan cheap and
// the answer small, and the feeds' own patterns judge the jobs after. The
// json fallback of local development has no sql: it loads the window whole
// and tests the words itself
export async function newcomersLike(
	since: Date,
	{ like, detailKeys }: FeedCandidates
): Promise<FeedJob[]> {
	const db = remult.dataProvider;
	if (db instanceof SqlDatabase) {
		const command = db.createCommand();
		// lists travel as json: remult's parameters pass arrays as json text
		const words = `array(select jsonb_array_elements_text(${command.param(JSON.stringify(like))}::jsonb))`;
		const { rows } = await command.execute(
			`select id, "fundSlug", company, title, url, category, "detailKey", "firstSeenAt" from jobs
			 where baseline = false and "firstSeenAt" >= ${command.param(since)}
			   and (title ilike any(${words}) or category ilike any(${words})
			     or "detailKey" in (select jsonb_array_elements_text(${command.param(JSON.stringify(detailKeys))}::jsonb)))
			 order by "firstSeenAt" desc`
		);
		return rows.map((r) => ({
			id: String(r.id),
			fundSlug: String(r.fundSlug),
			company: String(r.company),
			title: String(r.title),
			url: String(r.url),
			category: String(r.category),
			detailKey: String(r.detailKey),
			firstSeenAt: new Date(r.firstSeenAt)
		}));
	}
	const tests = like.map(likeTest);
	const keys = new Set(detailKeys);
	const found = await repo(Job).find({
		where: { baseline: false, firstSeenAt: { $gte: since } },
		orderBy: { firstSeenAt: 'desc' },
		limit: 1_000_000
	});
	return found.flatMap((j) =>
		j.firstSeenAt &&
		(tests.some((t) => t.test(j.title) || t.test(j.category)) || keys.has(j.detailKey))
			? [
					{
						id: j.id,
						fundSlug: j.fundSlug,
						company: j.company,
						title: j.title,
						url: j.url,
						category: j.category,
						detailKey: j.detailKey,
						firstSeenAt: j.firstSeenAt
					}
				]
			: []
	);
}

// when any fund was last refreshed successfully
export const latestFetchOf = (funds: Fund[]) =>
	funds.reduce<Date | undefined>(
		(latest, f) =>
			f.lastFetchedAt && (!latest || f.lastFetchedAt > latest) ? f.lastFetchedAt : latest,
		undefined
	);

// one feed rendered on the spot, from its own newcomers of the window
export const feedResponse = (
	event: RequestEvent,
	feed: FeedSpec,
	newcomers: (since: Date) => Promise<FeedJob[]>
) =>
	api.withRemult(event, async () => {
		const now = new Date();
		const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
		const [jobs, funds] = await Promise.all([newcomers(since), repo(Fund).find({ limit: 1000 })]);
		return new Response(rssFeed(jobs, latestFetchOf(funds), now, feed), {
			headers: {
				// browsers render plain xml as a document tree, while the feed's own
				// media type gets them offering a download; readers accept either
				'Content-Type': 'application/xml; charset=utf-8',
				// a night arrives once a day; the cdn keeps a rendering for hours
				// where readers ask in minutes
				'Cache-Control': 'public, max-age=0, s-maxage=14400, stale-while-revalidate=86400'
			}
		});
	});
