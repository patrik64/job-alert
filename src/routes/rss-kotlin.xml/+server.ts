import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { KOTLIN_FEED } from '../../server/rss';
import { describedIds } from '../../shared/ScrapeController';

// the language as a word — once for js and once for the database's posix
// engine
const KOTLIN = /\bkotlin\b/i;
const KOTLIN_SQL = '\\mkotlin\\M';

// GET /rss-kotlin.xml — the nightly newcomer digests narrowed to kotlin
// jobs. The language rarely makes a job's title, so the stored descriptions
// carry most of the matching; a description goes when its job closes, and
// the job quietly leaves the old night's item with it — readers keep the
// entry they already fetched
export const GET = (event: RequestEvent) =>
	feedResponse(event, KOTLIN_FEED, async () => {
		const described = new Set(await describedIds(KOTLIN_SQL, 'kotlin', KOTLIN));
		return (job) => KOTLIN.test(job.title) || KOTLIN.test(job.category) || described.has(job.id);
	});
