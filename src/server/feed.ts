// One handler behind both rss routes: load the recent newcomers, narrow them
// when the feed asks for a slice (the devops feed), and render the digests.

import type { RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from './api';
import { dayKey, rssFeed, WINDOW_DAYS, type FeedSpec } from './rss';
import { Fund } from '../shared/Fund';
import { Job } from '../shared/Job';

// a night on these boards can bring thousands of jobs; this many rows, newest
// first, cover the recent nights in full — a night cut off at the end is left out
const MAX_ROWS = 20_000;

export const feedResponse = (event: RequestEvent, feed: FeedSpec, match?: (job: Job) => boolean) =>
	api.withRemult(event, async () => {
		const now = new Date();
		const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

		// baseline imports are flagged on the rows, so the genuine newcomers are
		// simply everything else
		const [jobs, funds] = await Promise.all([
			repo(Job).find({
				where: { baseline: false, firstSeenAt: { $gte: since } },
				orderBy: { firstSeenAt: 'desc' },
				limit: MAX_ROWS
			}),
			repo(Fund).find({ limit: 1000 })
		]);

		let rows = jobs.flatMap((j) =>
			j.firstSeenAt && (!match || match(j))
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
				// a night arrives once a day; feed readers ask far more often
				'Cache-Control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600'
			}
		});
	});
