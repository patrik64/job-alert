import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { DEVOPS_FEED } from '../../server/rss';

// jobs that say devops themselves, in the title or the board's job function;
// descriptions stay out of it — "works closely with our devops team" does not
// make a devops job
const DEVOPS = /\bdev[\s-]?ops\b/i;

// GET /rss-devops.xml — the nightly newcomer digests narrowed to devops jobs
export const GET = (event: RequestEvent) =>
	feedResponse(event, DEVOPS_FEED, (job) => DEVOPS.test(job.title) || DEVOPS.test(job.category));
