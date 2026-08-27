import { FUNDS } from '../../shared/funds';
import type { JobBoardScraper } from './types';
// these slugs lead with a digit, so the bindings can't be named after them
import { board as zeroonea } from './01a';
import { board as twentyonefifty } from './2150';
import { board as a16z } from './a16z';
import { board as accel } from './accel';
import { board as airbus } from './airbus';
import { board as avp } from './avp';
import { board as b2venture } from './b2venture';
import { board as balderton } from './balderton';
import { board as base10 } from './base10';
import { board as battery } from './battery';
import { board as bessemer } from './bessemer';
import { board as canapi } from './canapi';
import { board as cherry } from './cherry';
import { board as congruent } from './congruent';
import { board as craft } from './craft';
import { board as creandum } from './creandum';
import { board as dcvc } from './dcvc';
import { board as earlybird } from './earlybird';
import { board as f2 } from './f2';
import { board as felicis } from './felicis';
import { board as flagship } from './flagship';
import { board as generalcatalyst } from './generalcatalyst';
import { board as greycroft } from './greycroft';
import { board as greylock } from './greylock';
import { board as grove } from './grove';
import { board as gv } from './gv';
import { board as headline } from './headline';
import { board as htgf } from './htgf';
import { board as hvcapital } from './hvcapital';
import { board as indexventures } from './indexventures';
import { board as insight } from './insight';
import { board as ivp } from './ivp';
import { board as khosla } from './khosla';
import { board as lakestar } from './lakestar';
import { board as lightspeed } from './lightspeed';
import { board as lux } from './lux';
import { board as nea } from './nea';
import { board as northzone } from './northzone';
import { board as norwest } from './norwest';
import { board as octopus } from './octopus';
import { board as plugandplay } from './plugandplay';
import { board as qumra } from './qumra';
import { board as seedcamp } from './seedcamp';
import { board as sequoia } from './sequoia';
import { board as sosv } from './sosv';
import { board as speedinvest } from './speedinvest';
import { board as stageone } from './stageone';
import { board as techstars } from './techstars';
import { board as type1 } from './type1';
import { board as ulu } from './ulu';
import { board as uncork } from './uncork';
import { board as underline } from './underline';
import { board as upfront } from './upfront';
import { board as urban } from './urban';
import { board as usv } from './usv';
import { board as vamos } from './vamos';
import { board as venrock } from './venrock';
import { board as vertex } from './vertex';
import { board as vestigo } from './vestigo';
import { board as viola } from './viola';
import { board as visible } from './visible';
import { board as visiblehands } from './visiblehands';
import { board as voyager } from './voyager';
import { board as willow } from './willow';
import { board as wing } from './wing';
import { board as xange } from './xange';
import { board as xfund } from './xfund';
import { board as xrc } from './xrc';
import { board as ycombinator } from './ycombinator';
import { board as zetta } from './zetta';

const impls: Record<string, JobBoardScraper> = {
	'01a': zeroonea,
	'2150': twentyonefifty,
	a16z,
	accel,
	airbus,
	avp,
	b2venture,
	balderton,
	base10,
	battery,
	bessemer,
	canapi,
	cherry,
	congruent,
	craft,
	creandum,
	dcvc,
	earlybird,
	f2,
	felicis,
	flagship,
	generalcatalyst,
	greycroft,
	greylock,
	grove,
	gv,
	headline,
	htgf,
	hvcapital,
	indexventures,
	insight,
	ivp,
	khosla,
	lakestar,
	lightspeed,
	lux,
	nea,
	northzone,
	norwest,
	octopus,
	plugandplay,
	qumra,
	seedcamp,
	sequoia,
	sosv,
	speedinvest,
	stageone,
	techstars,
	type1,
	ulu,
	uncork,
	underline,
	upfront,
	urban,
	usv,
	vamos,
	venrock,
	vertex,
	vestigo,
	viola,
	visiblehands,
	visible,
	voyager,
	willow,
	wing,
	xange,
	xfund,
	xrc,
	ycombinator,
	zetta
};

if (Object.keys(impls).length !== FUNDS.length || FUNDS.some((f) => !impls[f.slug]))
	throw new Error('scraper registry and shared FUNDS list are out of sync');

export const scrapers = FUNDS.map((f) => ({ ...f, board: impls[f.slug] }));
export const scraperBySlug = new Map(scrapers.map((s) => [s.slug, s]));
export type { JobBoardScraper, ScrapedJob, ScrapedJobDetail } from './types';
