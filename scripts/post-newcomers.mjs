// Announces the newcomers of a nightly fetch on Bluesky. Reads the result file
// fetch-all.mjs writes, asks the API which jobs the funds gained in that run,
// and publishes one post — or a short thread when the list is long.
//
//   node scripts/post-newcomers.mjs --dry-run    compose and print, post nothing
//   node scripts/post-newcomers.mjs              compose and post
//   node scripts/post-newcomers.mjs --current    ...announcing whatever the
//                                                newcomers page shows instead
//   node scripts/post-newcomers.mjs --check      prove the credentials work
//
// Credentials come from the environment (see bluesky.mjs); the account is yet
// to be created — the workflow names the handle it will have.

import { readFileSync } from 'node:fs';
import { checkCredentials, compose, postThread } from './bluesky.mjs';

const BASE_URL = process.env.BASE_URL ?? 'https://job-alert-pax.vercel.app';
const NEWCOMERS_URL = `${BASE_URL}/newcomers`;
const NEWCOMERS_LABEL = NEWCOMERS_URL.replace(/^https?:\/\//, '');

const arg = (name) => {
	const found = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
	return found?.includes('=') ? found.slice(found.indexOf('=') + 1) : undefined;
};

const DRY_RUN = process.argv.includes('--dry-run');
const RESULTS_FILE = arg('--results') ?? 'fetch-results.json';

async function api(path) {
	const resp = await fetch(`${BASE_URL}/api/${path}`);
	if (!resp.ok) throw new Error(`GET /api/${path.split('?')[0]} — ${resp.status}`);
	return resp.json();
}

// a job is named by its company and title
const asJobs = (rows) =>
	rows.map((j) => ({ label: `${j.company} – ${j.title}`, url: j.url ?? '' }));

// what the run recorded in the results file, fund by fund
async function groupsFromResults() {
	let results;
	try {
		results = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
	} catch {
		console.log(`no fetch results at ${RESULTS_FILE} — nothing to announce`);
		process.exit(0);
	}

	// only the funds that gained something in *this* run: a fund whose scrape
	// failed still carries the newcomer flags of whenever it last succeeded
	const gained = results.filter((r) => r.added > 0);
	if (gained.length === 0) {
		console.log('no newcomers in the last fetch — staying quiet');
		process.exit(0);
	}

	const groups = [];
	for (const fund of gained) {
		const query = `fundSlug=${encodeURIComponent(fund.slug)}&isNewcomer=true&_limit=100000`;
		let rows;
		try {
			rows = await api(`jobs?${query}`);
		} catch (err) {
			console.log(`skipping ${fund.slug}: ${err.message}`);
			continue;
		}
		if (rows.length === 0) continue;
		groups.push({ name: fund.name || fund.slug, jobs: asJobs(rows) });
	}
	return groups;
}

// everything the newcomers page is showing, whichever run turned it up — for
// announcing by hand
async function groupsFromNewcomers() {
	const [rows, funds] = await Promise.all([
		api('jobs?isNewcomer=true&_limit=100000'),
		api('funds?_limit=1000')
	]);
	const names = new Map(funds.map((f) => [f.slug, f.name]));

	const byFund = new Map();
	for (const row of rows) {
		if (!byFund.has(row.fundSlug)) byFund.set(row.fundSlug, []);
		byFund.get(row.fundSlug).push(row);
	}
	return [...byFund].map(([slug, rows]) => ({
		name: names.get(slug) || slug,
		jobs: asJobs(rows)
	}));
}

if (process.argv.includes('--check')) {
	await checkCredentials();
	process.exit(0);
}

const groups = process.argv.includes('--current')
	? await groupsFromNewcomers()
	: await groupsFromResults();

if (groups.length === 0) {
	console.log('nothing to announce — staying quiet');
	process.exit(0);
}

// the loudest funds first
groups.sort((a, b) => b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
const total = groups.reduce((n, g) => n + g.jobs.length, 0);

const headline = `${total} new ${total === 1 ? 'job' : 'jobs'} at vc-backed companies`;
const posts = compose(groups, headline, { label: NEWCOMERS_LABEL, url: NEWCOMERS_URL });
const url = await postThread(posts, { dryRun: DRY_RUN });

if (url && process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n[announced ${total} on bluesky](${url})\n`);
}
