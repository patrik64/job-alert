import { atsDetail } from './ats';
import { fetchJson, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedSalary } from './types';

// Some funds run their portfolio job board straight on greenhouse: one
// greenhouse board whose "offices" are the portfolio companies and whose
// departments are the job functions. The board api lists every posting in one
// request — with its description, which the enrichment pass reads back
// through the greenhouse resolver in ats.ts.

const API = 'https://boards-api.greenhouse.io/v1/boards';

interface Named {
	name?: string | null;
}

interface GreenhouseJob {
	id: number;
	title?: string | null;
	absolute_url?: string | null;
	location?: Named | null;
	offices?: Named[] | null;
	departments?: Named[] | null;
	company_name?: string | null;
	first_published?: string | null;
	metadata?: { name?: string | null; value?: unknown; value_type?: string | null }[] | null;
}

// a "Pay Range" metadata field: { unit, min_value, max_value }
function salaryOf(job: GreenhouseJob): ScrapedSalary | null {
	const range = (job.metadata ?? []).find((m) => m.value_type === 'currency_range')?.value as
		| { unit?: string; min_value?: string | number | null; max_value?: string | number | null }
		| undefined;
	if (!range) return null;
	const min = Number(range.min_value);
	const max = Number(range.max_value);
	if (!(min > 0) && !(max > 0)) return null;
	return {
		min: min > 0 ? min : null,
		max: max > 0 ? max : null,
		currency: (range.unit ?? '').toUpperCase(),
		period: normalizePeriod('year')
	};
}

const names = (list: Named[] | null | undefined) =>
	(list ?? []).map((x) => (x.name ?? '').trim()).filter(Boolean);

export function greenhouseBoard({ token }: { token: string }): JobBoardScraper {
	return {
		async list() {
			const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(`${API}/${token}/jobs?content=true`, {
				headers: { accept: 'application/json' }
			});
			const byKey = new Map<string, ScrapedJob>();
			for (const j of data.jobs ?? []) {
				const title = (j.title ?? '').trim();
				if (!j.id || !title) continue;
				const offices = names(j.offices);
				const departments = names(j.departments);
				const level = (j.metadata ?? []).find((m) => m.name === 'Level')?.value;
				const url = j.absolute_url ?? '';
				byKey.set(String(j.id), {
					key: String(j.id),
					// the offices are the portfolio companies; failing those, the
					// board's owner
					company: offices[0] ?? (j.company_name ?? '').trim(),
					companyUrl: '',
					title,
					url,
					applyUrl: url,
					category: [...departments, typeof level === 'string' ? level : ''].filter(Boolean).join(', '),
					sector: '',
					location: (j.location?.name ?? '').trim(),
					salary: salaryOf(j),
					postedAt: j.first_published ? new Date(j.first_published) : null
				});
			}
			if (byKey.size === 0) throw new Error(`greenhouse ${token}: the board lists no jobs`);
			return [...byKey.values()];
		},

		detail(job) {
			return atsDetail(job.applyUrl);
		}
	};
}
