import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { GO_FEED } from '../../server/rss';
import { describedIds } from '../../shared/ScrapeController';

// the language as a word — "Go", "Go/Rust", "Backend Engineer (Go)" — or as
// golang, in a title or job function. These boards are thick with go-to-market
// roles ("Go-To-Market Manager", "Go To Market Lead") and the odd go-getter,
// which the lookahead turns away. A description holds prose, where go is the
// commonest of verbs in any casing ("Go the extra mile"), so there only
// golang counts — the name postings reach for precisely because go alone
// says too little
const GO = /\bgolang\b|\bgo\b(?![ -]to[ -]market|[ -]getter)/i;
const GO_DESCRIBED = /\bgolang\b/i;
const GO_SQL = '\\mgolang\\M';

// GET /rss-go.xml — the nightly newcomer digests narrowed to go jobs. The
// language often lives in the description rather than the title; a
// description goes when its job closes, and the job quietly leaves the old
// night's item with it — readers keep the entry they already fetched
export const GET = (event: RequestEvent) =>
	feedResponse(event, GO_FEED, async () => {
		const described = new Set(await describedIds(GO_SQL, 'golang', GO_DESCRIBED));
		return (job) => GO.test(job.title) || GO.test(job.category) || described.has(job.id);
	});
