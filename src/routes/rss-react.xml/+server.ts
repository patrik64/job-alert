import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { REACT_FEED } from '../../server/rss';
import { describedIds } from '../../shared/ScrapeController';

// the framework as a word — react, react.js, reactjs, react native — in any
// case for a title or job function, where it can mean nothing else. A
// description holds prose, and react is also just an english verb ("react to
// incidents"), so there only the framework's proper name React counts — or
// the js/native forms, whose casing no verb ever wears
const REACT = /\breact(?:\.?js|[- ]native)?\b/i;
const REACT_DESCRIBED = /\bReact\b|\b[Rr]eact\.?[Jj][Ss]\b|\b[Rr]eact[- ][Nn]ative\b/;
const REACT_SQL = '\\mReact\\M|\\m[Rr]eact\\.?[Jj][Ss]\\M|\\m[Rr]eact[- ][Nn]ative\\M';

// GET /rss-react.xml — the nightly newcomer digests narrowed to react jobs.
// The framework often lives in the description rather than the title; a
// description goes when its job closes, and the job quietly leaves the old
// night's item with it — readers keep the entry they already fetched
export const GET = (event: RequestEvent) =>
	feedResponse(event, REACT_FEED, async () => {
		const described = new Set(await describedIds(REACT_SQL, 'react', REACT_DESCRIBED, true));
		return (job) => REACT.test(job.title) || REACT.test(job.category) || described.has(job.id);
	});
