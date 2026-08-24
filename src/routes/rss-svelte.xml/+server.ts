import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { SVELTE_FEED } from '../../server/rss';
import { describedIds } from '../../shared/ScrapeController';

// the framework as a word, with or without its kit — once for js and once
// for the database's posix engine
const SVELTE = /\bsvelte(?:kit)?\b/i;
const SVELTE_SQL = '\\msvelte(kit)?\\M';

// GET /rss-svelte.xml — the nightly newcomer digests narrowed to svelte
// jobs. The framework hardly ever makes a job's title, so the stored
// descriptions carry most of the matching; a description goes when its job
// closes, and the job quietly leaves the old night's item with it — readers
// keep the entry they already fetched
export const GET = (event: RequestEvent) =>
	feedResponse(event, SVELTE_FEED, async () => {
		const described = new Set(await describedIds(SVELTE_SQL, 'svelte', SVELTE));
		return (job) => SVELTE.test(job.title) || SVELTE.test(job.category) || described.has(job.id);
	});
