import { FUNDS } from '../../shared/funds';
import type { JobBoardScraper } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { board as zeroonea } from './01a';
import { board as twentyonefifty } from './2150';
import { board as gv } from './gv';
import { board as insight } from './insight';
import { board as khosla } from './khosla';
import { board as sequoia } from './sequoia';
import { board as ycombinator } from './ycombinator';

const impls: Record<string, JobBoardScraper> = {
	'01a': zeroonea,
	'2150': twentyonefifty,
	gv,
	insight,
	khosla,
	sequoia,
	ycombinator
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, board: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';
