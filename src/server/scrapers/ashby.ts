import { atsDetail } from './ats';
import { fetchJson, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedSalary } from './types';

// Some funds run their portfolio job board as one ashby organization whose
// departments are the portfolio companies (the fund's own openings sit under
// a department of its own name). The posting api lists every job in one
// request; the descriptions come from the same api through the ashby
// resolver in ats.ts, which caches the board between jobs.

const API = 'https://api.ashbyhq.com/posting-api/job-board';

interface AshbyJob {
	id?: string;
	title?: string | null;
	department?: string | null;
	team?: string | null;
	location?: string | null;
	secondaryLocations?: { location?: string | null }[] | null;
	isRemote?: boolean | null;
	isListed?: boolean | null;
	jobUrl?: string | null;
	publishedAt?: string | null;
	compensation?: {
		compensationTiers?: {
			components?: {
				compensationType?: string | null;
				interval?: string | null;
				currencyCode?: string | null;
				minValue?: number | null;
				maxValue?: number | null;
			}[];
		}[];
	} | null;
}

// the first salary component of any tier; equity and the like are skipped
function salaryOf(job: AshbyJob): ScrapedSalary | null {
	const parts = (job.compensation?.compensationTiers ?? []).flatMap((t) => t.components ?? []);
	const pay = parts.find(
		(c) => c.compensationType === 'Salary' && ((c.minValue ?? 0) > 0 || (c.maxValue ?? 0) > 0)
	);
	if (!pay) return null;
	return {
		min: (pay.minValue ?? 0) > 0 ? pay.minValue! : null,
		max: (pay.maxValue ?? 0) > 0 ? pay.maxValue! : null,
		currency: (pay.currencyCode ?? '').toUpperCase(),
		period: normalizePeriod(pay.interval)
	};
}

export function ashbyBoard({ org }: { org: string }): JobBoardScraper {
	return {
		async list() {
			const data = await fetchJson<{ jobs?: AshbyJob[] }>(
				`${API}/${encodeURIComponent(org)}?includeCompensation=true`,
				{ headers: { accept: 'application/json' } }
			);
			const byKey = new Map<string, ScrapedJob>();
			for (const j of data.jobs ?? []) {
				const title = (j.title ?? '').trim();
				if (!j.id || !title || j.isListed === false) continue;
				const places = [j.location ?? '', ...(j.secondaryLocations ?? []).map((l) => l.location ?? '')];
				const locations = [...new Set(places.map((p) => p.trim()).filter(Boolean))].join('; ');
				const mode = j.isRemote && !/remote/i.test(locations) ? 'remote' : '';
				const url = j.jobUrl ?? '';
				byKey.set(j.id, {
					key: j.id,
					// the departments are the portfolio companies
					company: (j.department ?? j.team ?? '').trim(),
					companyUrl: '',
					title,
					url,
					applyUrl: url,
					category: '',
					sector: '',
					location: [locations, mode].filter(Boolean).join(' · '),
					salary: salaryOf(j),
					postedAt: j.publishedAt ? new Date(j.publishedAt) : null
				});
			}
			if (byKey.size === 0) throw new Error(`ashby ${org}: the board lists no jobs`);
			return [...byKey.values()];
		},

		detail(job) {
			return atsDetail(job.applyUrl);
		}
	};
}
