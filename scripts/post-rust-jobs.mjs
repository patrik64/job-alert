// Announces the night's new rust jobs on Bluesky, from the account behind the
// rust jobs page. Asks the API for the page's jobs and keeps the newcomers
// among them — only those of funds that gained something in this very run
// (read from the result file fetch-all.mjs writes), since a fund whose scrape
// failed still carries the newcomer flags of whenever it last succeeded.
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
import { checkCredentials, compose, postThread } from './bluesky.mjs';

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

// the backend method behind the rust jobs page, newcomer flags included
const resp = await fetch(`${BASE_URL}/api/rustJobs`, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ args: [false] })
});
if (!resp.ok) throw new Error(`POST /api/rustJobs — ${resp.status}`);
const { data: hits } = await resp.json();

let fresh = hits.filter((h) => h.isNewcomer);
if (!process.argv.includes('--current')) {
	let results;
	try {
		results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
	} catch {
		console.log(`no fetch results at ${RESULTS_FILE} — nothing to announce`);
		process.exit(0);
	}
	const gained = new Set(results.filter((r) => r.added > 0).map((r) => r.slug));
	fresh = fresh.filter((h) => gained.has(h.fundSlug));
}

if (fresh.length === 0) {
	console.log('no new rust jobs — staying quiet');
	process.exit(0);
}

const funds = await fetch(`${BASE_URL}/api/funds?_limit=1000`);
if (!funds.ok) throw new Error(`GET /api/funds — ${funds.status}`);
const names = new Map((await funds.json()).map((f) => [f.slug, f.name]));

// grouped by fund and named like the newcomers announcement, loudest first
const byFund = new Map();
for (const h of fresh) {
	if (!byFund.has(h.fundSlug)) byFund.set(h.fundSlug, []);
	byFund.get(h.fundSlug).push({ label: `${h.company} – ${h.title}`, url: h.url ?? '' });
}
const groups = [...byFund]
	.map(([slug, jobs]) => ({ name: names.get(slug) || slug, jobs }))
	.sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));

const total = fresh.length;
const headline = `${total} new rust ${total === 1 ? 'job' : 'jobs'} at vc-backed companies`;
const posts = compose(groups, headline, { label: PAGE_LABEL, url: PAGE_URL });
const url = await postThread(posts, { dryRun: DRY_RUN });

if (url && process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	appendFileSync(
		process.env.GITHUB_STEP_SUMMARY,
		`\n[announced ${total} rust job${total === 1 ? '' : 's'} on bluesky](${url})\n`
	);
}
