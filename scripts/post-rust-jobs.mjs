// Announces the night's new rust jobs on Bluesky, from the account behind the
// rust jobs page: every one in Europe by name, then how many there are in all
// and at how many VCs, then the link to the page. Asks the API for the page's
// jobs and keeps the newcomers among them — only those of funds that gained
// something in this very run (read from the result file fetch-all.mjs
// writes), since a fund whose scrape failed still carries the newcomer flags
// of whenever it last succeeded. Where a job is comes from its location, read
// by the app's own region classifier (node runs the typescript as it is).
//
//   node scripts/post-rust-jobs.mjs --dry-run    compose and print, post nothing
//   node scripts/post-rust-jobs.mjs              compose and post
//   node scripts/post-rust-jobs.mjs --current    ...announcing every standing
//                                                rust newcomer, results file or not
//   node scripts/post-rust-jobs.mjs --check      prove the credentials work
//
// Credentials come from the environment (see bluesky.mjs); the workflow signs
// this announcement as rust-job-alert.bsky.social.

import { readFileSync } from 'node:fs';
import { checkCredentials, composeList, postThread } from './bluesky.mjs';
import { inEurope } from '../src/server/regions.ts';

const BASE_URL = process.env.BASE_URL ?? 'https://job-alert-pax.vercel.app';
const PAGE_URL = `${BASE_URL}/rust-jobs`;
const PAGE_LABEL = PAGE_URL.replace(/^https?:\/\//, '');

const arg = (name) => {
	const found = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
	return found?.includes('=') ? found.slice(found.indexOf('=') + 1) : undefined;
};

const DRY_RUN = process.argv.includes('--dry-run');
const RESULTS_FILE = arg('--results') ?? 'fetch-results.json';

if (process.argv.includes('--check')) {
	await checkCredentials();
	process.exit(0);
}

// the backend method behind the rust jobs page, newcomer flags included —
// its newest three-day window, which covers every standing newcomer, since
// the flags themselves only live half a day
const resp = await fetch(`${BASE_URL}/api/rustJobs`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ args: [0] })
});
if (!resp.ok) throw new Error(`POST /api/rustJobs — ${resp.status}`);
const { data } = await resp.json();
const hits = data.jobs;

let fresh = hits.filter((h) => h.isNewcomer);
if (!process.argv.includes('--current')) {
	let results;
	try {
		results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
	} catch {
		console.log(`no fetch results at ${RESULTS_FILE} — nothing to announce`);
		process.exit(0);
	}
	// newcomer flags survive half a day of fetches, so a fund that gained
	// again hours later still carries the morning's announced finds — only
	// the jobs that landed after this run began are named (with a few
	// minutes' grace between the runner's clock and the database's)
	const gained = new Map(
		results
			.filter((r) => r.added > 0)
			.map((r) => [r.slug, (Date.parse(r.startedAt ?? '') || 0) - 5 * 60_000])
	);
	fresh = fresh.filter((h) => {
		const since = gained.get(h.fundSlug);
		return since !== undefined && Date.parse(h.firstSeenAt) >= since;
	});
}

if (fresh.length === 0) {
	console.log('no new rust jobs — staying quiet');
	process.exit(0);
}

// one entry per job: several funds list the same one, each with its own
// spelling of where it is
const jobs = new Map();
for (const h of fresh) {
	const key = `${h.company}\n${h.title}`.toLowerCase();
	const job = jobs.get(key) ?? { company: h.company, title: h.title, url: h.url ?? '', locations: [] };
	job.locations.push(h.location ?? '');
	jobs.set(key, job);
}
const vcs = new Set(fresh.map((h) => h.fundSlug)).size;

// the part of a location that is in Europe — "Berlin, Germany" out of
// "San Francisco, CA, USA; Berlin, Germany"
const europeanPlace = (location) =>
	location
		.split(/\s*;\s*|\s+·\s+/)
		.find((part) => inEurope(part))
		?.trim();

const inEuropeNow = [...jobs.values()]
	.map((job) => ({ job, place: job.locations.filter(inEurope).map(europeanPlace)[0] }))
	.filter(({ job }) => job.locations.some(inEurope))
	.sort((a, b) => a.job.company.localeCompare(b.job.company) || a.job.title.localeCompare(b.job.title));

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const headline = inEuropeNow.length
	? `${count(inEuropeNow.length, 'new rust job', 'new rust jobs')} in Europe`
	: 'No new rust jobs in Europe today';
const items = inEuropeNow.map(({ job, place }) => ({
	label: `${job.company} – ${job.title}`,
	url: job.url,
	// the place, unless the whole of a long location line was all there was
	note: place && place.length <= 40 ? place : ''
}));
const closing = `In total: ${count(jobs.size, 'new rust job', 'new rust jobs')} at ${count(vcs, 'VC', 'VCs')}`;
const posts = composeList(headline, items, closing, { label: PAGE_LABEL, url: PAGE_URL });
const url = await postThread(posts, { dryRun: DRY_RUN });

if (url && process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`\n[announced ${inEuropeNow.length} of ${jobs.size} new rust jobs (the ones in Europe) on bluesky](${url})\n`
	);
}
