import type { RequestEvent } from '@sveltejs/kit';
import { storedFeedResponse } from '../../server/feeds';

// GET /rss-devops.xml — the stored nightly rendering (see server/feeds.ts,
// where this feed's narrowing lives)
export const GET = (event: RequestEvent) => storedFeedResponse(event, 'rss-devops');
