import type { RequestEvent } from '@sveltejs/kit';
import { feedResponse } from '../../server/feed';
import { PRODUCT_MANAGER_FEED } from '../../server/rss';

// the trade as words in the title — "Product Manager", "Director of Product
// Management" — and in the job function only the literal pair: the boards'
// Product Management tag also hangs on product marketing and production
// roles, so there the wider wording does not count
const PM_TITLE = /\bproduct manage(?:r|ment)\b/i;
const PM_FUNCTION = /\bproduct manager\b/i;

// GET /rss-product-manager.xml — the nightly newcomer digests narrowed to
// product manager jobs
export const GET = (event: RequestEvent) =>
	feedResponse(
		event,
		PRODUCT_MANAGER_FEED,
		() => (job) => PM_TITLE.test(job.title) || PM_FUNCTION.test(job.category)
	);
