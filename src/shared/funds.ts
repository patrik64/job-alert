// The tracked funds — each runs a public job board listing the openings at
// its portfolio companies. Slugs match the scraper module filenames in
// src/server/scrapers/; url is the board's job listing page.
export interface FundInfo {
	slug: string;
	name: string;
	url: string;
}

export const FUNDS: FundInfo[] = [
	{ slug: '01a', name: '01 Advisors', url: 'https://jobs.01a.com/jobs' },
	{ slug: '2150', name: '2150', url: 'https://2150.getro.com/jobs' },
	{ slug: 'accel', name: 'Accel', url: 'https://jobs.accel.com/jobs' },
	{ slug: 'a16z', name: 'Andreessen Horowitz', url: 'https://jobs.a16z.com/jobs' },
	{ slug: 'avp', name: 'AVP', url: 'https://jobs.avpcap.com/jobs' },
	{ slug: 'b2venture', name: 'b2venture', url: 'https://jobs.b2venture.vc/jobs' },
	{ slug: 'balderton', name: 'Balderton Capital', url: 'https://careers.balderton.com/jobs' },
	{ slug: 'base10', name: 'Base10', url: 'https://careers.base10.vc/jobs' },
	{ slug: 'battery', name: 'Battery Ventures', url: 'https://jobs.battery.com/jobs' },
	{ slug: 'bessemer', name: 'Bessemer Venture Partners', url: 'https://jobs.bvp.com/jobs' },
	{ slug: 'canapi', name: 'Canapi Ventures', url: 'https://careers.canapi.com/jobs' },
	{ slug: 'congruent', name: 'Congruent Ventures', url: 'https://jobs.congruentvc.com/jobs' },
	{ slug: 'craft', name: 'Craft Ventures', url: 'https://jobs.craftventures.com/jobs' },
	{ slug: 'creandum', name: 'Creandum', url: 'https://careers.creandum.com/jobs' },
	{ slug: 'dcvc', name: 'DCVC', url: 'https://jobs.dcvc.com/jobs' },
	{ slug: 'earlybird', name: 'Earlybird Venture Capital', url: 'https://jobs.earlybird.com/jobs' },
	{ slug: 'felicis', name: 'Felicis', url: 'https://jobs.felicis.com/jobs' },
	{ slug: 'flagship', name: 'Flagship Pioneering', url: 'https://www.flagshippioneering.com/join/roles' },
	{ slug: 'generalcatalyst', name: 'General Catalyst', url: 'https://jobs.generalcatalyst.com/jobs' },
	{ slug: 'greycroft', name: 'Greycroft', url: 'https://jobs.greycroft.com/jobs' },
	{ slug: 'greylock', name: 'Greylock', url: 'https://jobs.greylock.com/jobs' },
	{ slug: 'gv', name: 'GV', url: 'https://jobs.gv.com/jobs' },
	{ slug: 'headline', name: 'Headline', url: 'https://jobs.headline.com/jobs' },
	{ slug: 'indexventures', name: 'Index Ventures', url: 'https://indexventures.getro.com/jobs' },
	{ slug: 'insight', name: 'Insight Partners', url: 'https://jobs.insightpartners.com/jobs' },
	{ slug: 'khosla', name: 'Khosla Ventures', url: 'https://jobs.khoslaventures.com/jobs' },
	{ slug: 'lightspeed', name: 'Lightspeed Venture Partners', url: 'https://jobs.lsvp.com/jobs' },
	{ slug: 'nea', name: 'New Enterprise Associates', url: 'https://careers.nea.com/jobs' },
	{ slug: 'sequoia', name: 'Sequoia Capital', url: 'https://jobs.sequoiacap.com/jobs' },
	{ slug: 'ycombinator', name: 'Y Combinator', url: 'https://www.ycombinator.com/jobs' }
];

export const fundName = new Map(FUNDS.map((f) => [f.slug, f.name]));
export const fundBySlug = new Map(FUNDS.map((f) => [f.slug, f]));
