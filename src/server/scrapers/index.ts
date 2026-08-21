import { FUNDS } from '../../shared/funds';
import type { JobBoardScraper } from './types';
// this slug leads with a digit, so the binding can't be named after it
import { board as twentyonefifty } from './2150';
import { board as gv } from './gv';
import { board as insight } from './insight';
import { board as khosla } from './khosla';
import { board as ycombinator } from './ycombinator';

const impls: Record<string, JobBoardScraper> = {
	'2150': twentyonefifty,
	gv,
	insight,
	khosla,
	ycombinator
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, board: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';
