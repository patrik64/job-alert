import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { UX_FEED } from '../../server/rss';

// the trade in a title or job function — "UX Designer", "UX/UI", the
// discipline spelled out ("Head of User Experience"), or a graphic designer
// with or without the s. A trade is not a stack: half the engineering
// postings promise close work with the ux team in their descriptions, so
// unlike the language feeds this one never reads them
const UX = /\bux\b|\buser experience\b|\bgraphics? design/i;

// GET /rss-ux.xml — the nightly newcomer digests narrowed to ux and graphic
// design jobs
export const GET = (event: RequestEvent) =>
	feedResponse(event, UX_FEED, () => (job) => UX.test(job.title) || UX.test(job.category));
