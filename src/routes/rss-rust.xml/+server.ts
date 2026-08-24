import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { RUST_FEED } from '../../server/rss';
import { describedIds, RUST, RUST_SQL } from '../../shared/ScrapeController';

// GET /rss-rust.xml — the nightly newcomer digests narrowed to rust jobs, by
// the same notion the rust jobs page and the bluesky announcements hold: the
// language named in the title or job function, or mentioned in the stored
// description. A description goes when its job closes, so a job matched only
// there quietly leaves the old night's item once it closes — readers keep the
// entry they already fetched
export const GET = (event: RequestEvent) =>
	feedResponse(event, RUST_FEED, async () => {
		const described = new Set(await describedIds(RUST_SQL, 'rust', RUST));
		return (job) => RUST.test(job.title) || RUST.test(job.category) || described.has(job.id);
	});
