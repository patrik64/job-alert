import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { NEWCOMERS_FEED } from '../../server/rss';

// GET /rss.xml — the nightly newcomer digests as an rss feed
export const GET = (event: RequestEvent) => feedResponse(event, NEWCOMERS_FEED);
