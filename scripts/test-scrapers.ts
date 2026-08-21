// Standalone smoke test for the board scrapers, outside the SvelteKit app:
//   pnpm test-scrapers              run every board
//   pnpm test-scrapers gv khosla    run selected ones
// Lists each board and, where the board keeps job details on pages of their
// own, fetches the first job's detail as well.
import { scraperBySlug, scrapers } from '../src/server/scrapers/index';

const args = process.argv.slice(2);
const targets = args.length
	? args.map((slug) => {
			const s = scraperBySlug.get(slug);
			if (!s) {
				console.error(`unknown scraper: ${slug}`);
				process.exit(1);
			}
			return s;
		})
	: scrapers;

const seconds = (since: number) => ((Date.now() - since) / 1000).toFixed(1);

let failed = 0;
for (const s of targets) {
	const t0 = Date.now();
	try {
		const jobs = await s.board.list();
		const withCategory = jobs.filter((j) => j.category).length;
		const withSalary = jobs.filter((j) => j.salary).length;
		console.log(
			`OK   ${s.slug.padEnd(10)} ${String(jobs.length).padStart(6)} jobs in ${seconds(t0)}s` +
				`  (${withCategory} with category, ${withSalary} with salary)`
		);
		for (const j of jobs.slice(0, 3)) {
			console.log(`     ${j.company} — ${j.title}  [${j.location}]`);
		}
		if (s.board.detail && jobs.length) {
			const t1 = Date.now();
			const d = await s.board.detail(jobs[0]);
			console.log(
				d
					? `     detail: ${d.description.length} chars, category "${d.category ?? "(unchanged)"}" in ${seconds(t1)}s`
					: '     detail: the job is gone'
			);
		}
	} catch (err) {
		failed++;
		console.log(`FAIL ${s.slug.padEnd(10)} ${err instanceof Error ? err.message : err}`);
	}
}
console.log(`\n${targets.length - failed}/${targets.length} scrapers OK`);
process.exit(failed ? 1 : 0);
