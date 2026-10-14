import { flightText, readArray } from './considernext';
import { fetchWithRetry, normalizePeriod } from './http';
import type { JobBoardScraper, ScrapedJob } from './types';

// 4impact's job board — a hulp.work board, a next.js app that renders a page
// of vacancies at a time (?page=1, 2, …) into its server payload: each with
// its id, the title, the company, the places, a job family and a summary of
// the role and the company — no link to the posting itself, so the job's
// page on the board, /en/jobs/<id>, is its link. The pages are read in turn
// until the payload's page count is reached. The summaries stand in for the
// descriptions, from a short-lived copy of the list; the board's open
// applications are no jobs.

const BASE = 'https://jobs.4impact.vc';
const MAX_PAGES = 40;
const LIST_TTL_MS = 10 * 60_000;

interface Vacancy {
	vacancyId?: string | null;
	professionTitle?: string | null;
	vacancyStatusOpenDt?: string | null;
	vacancyLocations?: { city?: string | null; countryName?: string | null }[] | null;
	vacancyRole?: string | null;
	vacancyRoleAndCompanyDescription?: string | null;
	listingType?: { isOpenApplication?: boolean | null } | null;
	company?: { companyNm?: string | null } | null;
	jobFamily?: { name?: string | null } | null;
	salary?: {
		salaryMin?: number | null;
		salaryMax?: number | null;
		salaryCurrency?: string | null;
		salaryPeriod?: string | null;
	} | null;
}

interface PageInfo {
	itemsTotal?: number;
	pageMax?: number;
}

async function readPage(n: number): Promise<{ items: Vacancy[]; info: PageInfo }> {
	const url = `${BASE}/en/jobs?page=${n}`;
	const resp = await fetchWithRetry(url);
	if (!resp.ok) throw new Error(`${url}: the page answered ${resp.status}`);
	const flight = flightText(await resp.text());
	const at = flight.indexOf('"data":{"items":[');
	if (at < 0) throw new Error(`${url}: the page carries no vacancies`);
	const items = JSON.parse(readArray(flight, at + '"data":{"items":'.length)) as Vacancy[];
	const info = flight.slice(at).match(/"pageInfo":(\{[^{}]*\})/)?.[1];
	return { items, info: info ? (JSON.parse(info) as PageInfo) : {} };
}

let listed: { vacancies: Promise<Vacancy[]>; readAt: number } | undefined;

function readVacancies(): Promise<Vacancy[]> {
	if (listed && Date.now() - listed.readAt < LIST_TTL_MS) return listed.vacancies;
	const vacancies = (async () => {
		const first = await readPage(1);
		const all = [...first.items];
		const pages = Math.min(first.info.pageMax ?? 1, MAX_PAGES);
		for (let n = 2; n <= pages; n++) all.push(...(await readPage(n)).items);
		const total = first.info.itemsTotal ?? all.length;
		// fail loudly rather than import a partial list, whose missing jobs
		// would be marked closed and announced again later
		if (all.length < total * 0.95) throw new Error(`${BASE}: collected ${all.length} of ${total} vacancies`);
		return all;
	})();
	listed = { vacancies, readAt: Date.now() };
	// a failed read is not kept
	vacancies.catch(() => (listed = undefined));
	return vacancies;
}

const pageOf = (id: string) => `${BASE}/en/jobs/${id}`;

export const board: JobBoardScraper = {
	async list() {
		const byKey = new Map<string, ScrapedJob>();
		for (const v of await readVacancies()) {
			const title = (v.professionTitle ?? '').trim();
			if (!v.vacancyId || !title || v.listingType?.isOpenApplication || byKey.has(v.vacancyId)) continue;
			const { salaryMin: min, salaryMax: max } = v.salary ?? {};
			byKey.set(v.vacancyId, {
				key: v.vacancyId,
				company: (v.company?.companyNm ?? '').trim(),
				companyUrl: '',
				title,
				url: pageOf(v.vacancyId),
				applyUrl: pageOf(v.vacancyId),
				category: v.jobFamily?.name ?? '',
				sector: '',
				location: [
					...new Set(
						(v.vacancyLocations ?? []).map((p) => [p.city, p.countryName].filter(Boolean).join(', '))
					)
				]
					.filter(Boolean)
					.join('; '),
				salary:
					min || max
						? {
								min: min || null,
								max: max || null,
								currency: (v.salary?.salaryCurrency ?? '').toUpperCase(),
								period: normalizePeriod(v.salary?.salaryPeriod)
							}
						: null,
				postedAt: v.vacancyStatusOpenDt ? new Date(v.vacancyStatusOpenDt) : null
			});
		}
		if (byKey.size === 0) throw new Error(`${BASE}: the board lists no vacancies`);
		return [...byKey.values()];
	},

	async detail(job) {
		const v = (await readVacancies()).find((x) => x.vacancyId && pageOf(x.vacancyId) === job.url);
		const parts = [v?.vacancyRole, v?.vacancyRoleAndCompanyDescription].map((s) => (s ?? '').trim()).filter(Boolean);
		return parts.length ? { description: parts.map((p) => `<p>${p}</p>`).join('\n') } : null;
	}
};
