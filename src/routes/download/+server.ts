import { dev } from '$app/environment';
import { error, type RequestEvent } from '@sveltejs/kit';
import { repo } from 'remult';
import { api } from '../../server/api';
import { Fund } from '../../shared/Fund';
import { Job } from '../../shared/Job';
import { FUNDS } from '../../shared/funds';

// GET /download — every listed job grouped by fund and company, served as a
// JSON attachment (descriptions stay out: they would multiply the size).
// A dev convenience: in production the route 404s like the links to it.
export const GET = (event: RequestEvent) => {
	if (!dev) error(404, 'Not found');
	return api.withRemult(event, async () => {
		const [jobs, fundRows] = await Promise.all([
			repo(Job).find({
				orderBy: { company: 'asc', title: 'asc' },
				limit: 1_000_000
			}),
			repo(Fund).find({ limit: 1000 })
		]);
		const bySlug = new Map(fundRows.map((f) => [f.slug, f]));

		const payload = {
			generatedAt: new Date().toISOString(),
			fundCount: FUNDS.length,
			jobCount: jobs.length,
			funds: FUNDS.map((fund) => {
				const rows = jobs.filter((j) => j.fundSlug === fund.slug);
				const companies = new Map<string, Job[]>();
				for (const j of rows) {
					const list = companies.get(j.company);
					if (list) list.push(j);
					else companies.set(j.company, [j]);
				}
				return {
					slug: fund.slug,
					name: fund.name,
					url: fund.url,
					lastFetchedAt: bySlug.get(fund.slug)?.lastFetchedAt ?? null,
					jobCount: rows.length,
					companies: [...companies.entries()].map(([name, list]) => ({
						name,
						url: list[0].companyUrl,
						sector: list[0].sector,
						jobs: list.map((j) => ({
							title: j.title,
							url: j.url,
							applyUrl: j.applyUrl,
							category: j.category,
							location: j.location,
							salaryMin: j.salaryMin,
							salaryMax: j.salaryMax,
							salaryCurrency: j.salaryCurrency,
							salaryPeriod: j.salaryPeriod,
							postedAt: j.postedAt,
							firstSeenAt: j.firstSeenAt
						}))
					}))
				};
			})
		};

		return new Response(JSON.stringify(payload), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': 'attachment; filename="job-alert-jobs.json"'
			}
		});
	});
};
