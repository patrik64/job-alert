import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { CPP_FEED } from '../../server/rss';

// the language written out ("C++", also mid-title as in "C/C++") or as the
// word cpp; a word boundary can't follow the pluses, so only the start of
// the name gets one
const CPP = /\bc\+\+|\bcpp\b/i;

// GET /rss-cpp.xml — the nightly newcomer digests narrowed to c++ jobs
export const GET = (event: RequestEvent) =>
	feedResponse(event, CPP_FEED, () => (job) => CPP.test(job.title) || CPP.test(job.category));
