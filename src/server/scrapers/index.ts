import { FUNDS } from '../../shared/funds';
import type { JobBoardScraper } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { board as zeroonea } from './01a';
import { board as twentyonefifty } from './2150';
import { board as a16z } from './a16z';
import { board as accel } from './accel';
import { board as avp } from './avp';
import { board as b2venture } from './b2venture';
import { board as balderton } from './balderton';
import { board as base10 } from './base10';
import { board as battery } from './battery';
import { board as bessemer } from './bessemer';
import { board as canapi } from './canapi';
import { board as congruent } from './congruent';
import { board as craft } from './craft';
import { board as creandum } from './creandum';
import { board as dcvc } from './dcvc';
import { board as earlybird } from './earlybird';
import { board as felicis } from './felicis';
import { board as flagship } from './flagship';
import { board as generalcatalyst } from './generalcatalyst';
import { board as greycroft } from './greycroft';
import { board as greylock } from './greylock';
import { board as gv } from './gv';
import { board as headline } from './headline';
import { board as indexventures } from './indexventures';
import { board as insight } from './insight';
import { board as khosla } from './khosla';
import { board as lightspeed } from './lightspeed';
import { board as nea } from './nea';
import { board as sequoia } from './sequoia';
import { board as ycombinator } from './ycombinator';

const impls: Record<string, JobBoardScraper> = {
	'01a': zeroonea,
	'2150': twentyonefifty,
	a16z,
	accel,
	avp,
	b2venture,
	balderton,
	base10,
	battery,
	bessemer,
	canapi,
	congruent,
	craft,
	creandum,
	dcvc,
	earlybird,
	felicis,
	flagship,
	generalcatalyst,
	greycroft,
	greylock,
	gv,
	headline,
	indexventures,
	insight,
	khosla,
	lightspeed,
	nea,
	sequoia,
	ycombinator
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, board: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';
