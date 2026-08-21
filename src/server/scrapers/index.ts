import { FUNDS } from '../../shared/funds';
import type { JobBoardScraper } from './types';
import { board as gv } from './gv';
import { board as insight } from './insight';
import { board as khosla } from './khosla';
import { board as ycombinator } from './ycombinator';

const impls: Record<string, JobBoardScraper> = {
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
