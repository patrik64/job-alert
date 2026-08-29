// Nightly fetch-all: refreshes every fund on the production deployment by
// calling the same endpoints the dashboard's "fetch all" button uses, one
// fund at a time — first the listing, then the enrichment passes that fetch
// the descriptions a board keeps on pages of their own, until none remain.
// Plain Node, no dependencies — runs on a bare CI runner.
//
//   node scripts/fetch-all.mjs                    refresh every fund
//   node scripts/fetch-all.mjs --only=gv,khosla   refresh a subset (smoke test)
//
// What each fund gained lands in fetch-results.json, which post-rust-jobs.mjs
// reads to announce the night's rust finds.

import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL ?? 'https://job-alert-pax.vercel.app';
// one fund at a time: the boards on the same platform share one paced
// request budget, and two of them listing at once crowd each other out
const CONCURRENCY = 1;
// fetchFund aborts its listing after 4 minutes; give the request a little more
const REQUEST_TIMEOUT = 300_000;
// one enrichment pass stops taking on jobs after this long; a board of ten
// thousand jobs needs a handful of passes on its first night, a few seconds
// after that. The pass may overrun a little while its last jobs finish, so
// its request gets more room, and a pass that fails is simply tried again —
// the jobs it did not reach stay pending for the next pass or the next night
const ENRICH_BUDGET_MS = 180_000;
const ENRICH_TIMEOUT = 420_000;
const ENRICH_PASSES = 12;
const ENRICH_FAILURES = 2;

const arg = (name) => {
	const found = process.argv.find((a) => a === name || a.startsWith(`${name}=`));
	return found?.includes('=') ? found.slice(found.indexOf('=') + 1) : undefined;
};

const only = arg('--only')?.split(',').filter(Boolean);
const RESULTS_FILE = arg('--results') ?? 'fetch-results.json';

// every board the server's registry knows — including one just added to the
// code that has never been fetched: its first fetch imports the baseline
let funds;
try {
	funds = await call('listBoards', []);
} catch (err) {
	console.error(`failed to list the boards: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}
if (only) {
	const known = new Map(funds.map((f) => [f.slug, f]));
	funds = only.map((slug) => known.get(slug) ?? { slug, name: slug });
}
console.log(`refreshing ${funds.length} funds against ${BASE_URL}\n`);

// a remult backend method: POST /api/<name> with { args }, answering { data }
async function call(method, args, timeout = REQUEST_TIMEOUT) {
	const resp = await fetch(`${BASE_URL}/api/${method}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ args }),
		signal: AbortSignal.timeout(timeout)
	});
	if (!resp.ok) {
		const body = await resp.text();
		let message = body;
		try {
			message = JSON.parse(body).message ?? body;
		} catch {
			// not json — the body is the message
		}
		throw new Error(`${resp.status} ${message}`);
	}
	return (await resp.json()).data;
}

const results = [];
const queue = [...funds];

async function worker() {
	for (let fund = queue.shift(); fund; fund = queue.shift()) {
		const started = Date.now();
		const elapsed = () => Math.round((Date.now() - started) / 1000);
		try {
			const data = await call('fetchFund', [fund.slug]);
			console.log(
				`ok   ${fund.slug.padEnd(10)} ${elapsed()}s  ${data.total} jobs, ` +
					(data.baseline ? 'baseline import' : `${data.added} new, ${data.closed} closed`) +
					(data.pending ? `, ${data.pending} awaiting details` : '')
			);
			let enriched = 0;
			let remaining = data.pending;
			let failures = 0;
			for (let pass = 0; remaining > 0 && pass < ENRICH_PASSES; pass++) {
				let r;
				try {
					r = await call('enrichFund', [fund.slug, ENRICH_BUDGET_MS], ENRICH_TIMEOUT);
				} catch (err) {
					const message = String(err instanceof Error ? err.message : err).slice(0, 120);
					console.log(`     ${fund.slug.padEnd(10)} ${elapsed()}s  pass failed: ${message}`);
					if (++failures >= ENRICH_FAILURES) break;
					continue;
				}
				failures = 0;
				enriched += r.enriched;
				remaining = r.remaining;
				console.log(
					`     ${fund.slug.padEnd(10)} ${elapsed()}s  detailed ${r.enriched}, ${r.remaining} left` +
						(r.failed ? `, ${r.failed} failed` : '')
				);
				if (r.enriched === 0) break;
			}
			results.push({ slug: fund.slug, name: fund.name, ...data, enriched, remaining });
		} catch (err) {
			const message = String(err instanceof Error ? err.message : err).slice(0, 200);
			results.push({ slug: fund.slug, name: fund.name, error: message });
			console.log(`FAIL ${fund.slug.padEnd(10)} ${elapsed()}s  ${message.slice(0, 120)}`);
		}
	}
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// one more chance for whatever failed: the biggest boards ride close to
// vercel's 300-second function cap, and a slow night on their platform
// pushes one over — a second attempt usually fits. A broadly failing night
// is not retried; that is something actually broken
const firstTry = results.filter((r) => r.error);
if (firstTry.length && firstTry.length <= results.length * 0.2) {
	console.log(`\nretrying: ${firstTry.map((f) => f.slug).join(', ')}`);
	for (const f of firstTry) {
		results.splice(results.indexOf(f), 1);
		queue.push({ slug: f.slug, name: f.name });
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

const failed = results.filter((r) => r.error);
const added = results.reduce((n, r) => n + (r.added ?? 0), 0);
console.log(`\n${results.length - failed.length}/${results.length} funds refreshed, ${added} newcomers`);
if (failed.length) {
	console.log(`failed: ${failed.map((f) => f.slug).join(', ')}`);
}

// what the run found, for post-rust-jobs.mjs
writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

// a summary for the workflow-run page
if (process.env.GITHUB_STEP_SUMMARY) {
	const { appendFileSync } = await import('node:fs');
	const lines = [
		`## fetch all — ${results.length - failed.length}/${results.length} funds, ${added} newcomers`,
		'',
		...results
			.filter((r) => r.added > 0)
			.map((r) => `- **${r.slug}**: ${r.added} new, ${r.closed} closed`),
		...results.filter((r) => r.baseline).map((r) => `- **${r.slug}**: baseline import, ${r.total} jobs`),
		...failed.map((f) => `- ❌ **${f.slug}**: ${f.error}`)
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

// one stubborn board must not turn every night red — only a broad failure
// fails the run
process.exit(failed.length > results.length * 0.2 ? 1 : 0);
