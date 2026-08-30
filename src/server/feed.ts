// One handler behind the rss routes: load the recent newcomers, narrow them
// to the feed's slice, and render the digests.

import type { RequestEvent } from '@sveltejs/kit';
import { remult, repo, SqlDatabase } from 'remult';
import { api } from './api';
import { dayKey, rssFeed, WINDOW_DAYS, type FeedSpec } from './rss';
import { Fund } from '../shared/Fund';
import { Job } from '../shared/Job';

// a night on these boards can bring thousands of jobs; this many rows, newest
// first, cover the recent nights in full — a night cut off at the end is left out
const MAX_ROWS = 20_000;

// what a feed reads of a job: the digest line's fields, plus the two the
// narrowed feeds judge by
export interface FeedJob {
	id: string;
	fundSlug: string;
	company: string;
	title: string;
	url: string;
	category: string;
	firstSeenAt: Date;
}

// the window's newcomers, newest first — as the few columns above, since the
// full rows would be megabytes a request off the database; the json fallback
// of local development has no sql and loads them whole
const recentNewcomers = async (since: Date): Promise<FeedJob[]> => {
	const db = remult.dataProvider;
	if (db instanceof SqlDatabase) {
		const { rows } = await db.execute(
			`select id, "fundSlug", company, title, url, category, "firstSeenAt" from jobs
			 where baseline = false and "firstSeenAt" >= '${since.toISOString()}'
			 order by "firstSeenAt" desc limit ${MAX_ROWS}`
		);
		return rows.map((r) => ({
			id: String(r.id),
			fundSlug: String(r.fundSlug),
			company: String(r.company),
			title: String(r.title),
			url: String(r.url),
			category: String(r.category),
			firstSeenAt: new Date(r.firstSeenAt)
		}));
	}
	const found = await repo(Job).find({
		where: { baseline: false, firstSeenAt: { $gte: since } },
		orderBy: { firstSeenAt: 'desc' },
		limit: MAX_ROWS
	});
	return found.flatMap((j) =>
		j.firstSeenAt
			? [
					{
						id: j.id,
						fundSlug: j.fundSlug,
						company: j.company,
						title: j.title,
						url: j.url,
						category: j.category,
						firstSeenAt: j.firstSeenAt
					}
				]
			: []
	);
};

export const feedResponse = (
	event: RequestEvent,
	feed: FeedSpec,
	// built inside the request, so it can ask the database first (the rust
	// feed's description matches), then judges each job
	narrow?: () => ((job: FeedJob) => boolean) | Promise<(job: FeedJob) => boolean>
) =>
	api.withRemult(event, async () => {
		const match = narrow ? await narrow() : undefined;
		const now = new Date();
		const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

		// baseline imports are flagged on the rows, so the genuine newcomers are
		// simply everything else
		const [jobs, funds] = await Promise.all([
			recentNewcomers(since),
			repo(Fund).find({ limit: 1000 })
		]);

		let rows = jobs.flatMap((j) =>
			!match || match(j)
				? [{ fundSlug: j.fundSlug, company: j.company, title: j.title, url: j.url, firstSeenAt: j.firstSeenAt }]
				: []
		);
		// the truncated day is judged by the full query, not the narrowed rows —
		// a narrowed feed may not even reach the day the limit cut into
		const oldestFetched = jobs.length === MAX_ROWS ? jobs[jobs.length - 1].firstSeenAt : null;
		if (oldestFetched) {
			const oldest = dayKey(oldestFetched);
			rows = rows.filter((r) => dayKey(r.firstSeenAt) !== oldest);
		}
		const latestFetch = funds.reduce<Date | undefined>(
			(latest, f) =>
				f.lastFetchedAt && (!latest || f.lastFetchedAt > latest) ? f.lastFetchedAt : latest,
			undefined
		);

		return new Response(rssFeed(rows, latestFetch, now, feed), {
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
