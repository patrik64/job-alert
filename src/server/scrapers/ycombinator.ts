import { fetchWithRetry, mapConcurrent } from './http';
import type { JobBoardScraper, ScrapedJob, ScrapedSalary } from './types';

// Y Combinator's job board (ycombinator.com/jobs) is a rails/inertia app whose
// job search lives behind a login on workatastartup.com; the public pages only
// ever show a sample. What is public and complete: a sitemap naming every job
// page (including ones long gone), and each company's page, which embeds the
// company's current postings with all their fields. So the board is listed
// company by company — the sitemap says which companies are hiring — and a
// job's own page is read only for its description.

const BASE = 'https://www.ycombinator.com';
const SITEMAP = `${BASE}/jobs/sitemap`;
const COMPANY_CONCURRENCY = 6;

interface Posting {
	title?: string | null;
	url?: string | null;
	applyUrl?: string | null;
	location?: string | null;
	type?: string | null;
	prettyRole?: string | null;
	roleSpecificType?: string | null;
	salaryRange?: string | null;
	createdAt?: string | null;
	description?: string | null;
}

interface PageProps {
	company?: { name?: string | null; tags?: string[] | null } | null;
	jobPostings?: Posting[] | null;
	job?: Posting | null;
}

// the inertia page data sits html-escaped in a data-page attribute
const ESCAPES: Record<string, string> = { quot: '"', '#39': "'", lt: '<', gt: '>', amp: '&' };

function pageProps(html: string): PageProps | null {
	const m = html.match(/data-page="([^"]+)"/);
	if (!m) return null;
	const json = m[1].replace(/&(quot|#39|lt|gt|amp);/g, (_, e) => ESCAPES[e]);
	return (JSON.parse(json) as { props?: PageProps }).props ?? null;
}

const titleFromSlug = (slug: string) =>
	slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const SYMBOL_CURRENCY: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR', '¥': 'JPY' };

// "$160K - $220K", "£60K - £80K GBP", "$124K - $188K CAD" — yearly; "$1" and
// the like are placeholders
function parseSalary(range: string | null | undefined): ScrapedSalary | null {
	const s = (range ?? '').trim();
	if (!s) return null;
	const amounts = [...s.matchAll(/([\d.,]+)\s*([KkMm])?/g)]
		.map((m) => Number(m[1].replace(/,/g, '')) * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2] ? 1e3 : 1))
		.filter((n) => Number.isFinite(n) && n > 0);
	if (amounts.length === 0) return null;
	const min = amounts[0];
	const max = amounts[1] ?? amounts[0];
	if (max < 1000) return null;
	const code = s.match(/\b([A-Z]{3})\s*$/)?.[1];
	const symbol = s.match(/[$£€₹¥]/)?.[0];
	return { min, max, currency: code ?? (symbol ? (SYMBOL_CURRENCY[symbol] ?? '') : ''), period: 'year' };
}

// the board only says "20 days", "3 months", "about 1 year", "almost 4 years";
// the date is that far back, give or take
function approxDate(relative: string | null | undefined): Date | null {
	const m = (relative ?? '').match(/(\d+)\s*(hour|day|week|month|year)/);
	if (!m) return null;
	const n = Number(m[1]);
	const days = { hour: n / 24, day: n, week: n * 7, month: n * 30, year: n * 365 }[m[2]] ?? 0;
	return new Date(Date.now() - days * 86_400_000);
}

function toJob(slug: string, company: string, tags: string[], p: Posting): ScrapedJob | null {
	const path = p.url ?? '';
	const code = path.match(/\/jobs\/([^/-]+)-/)?.[1] ?? path.match(/\/jobs\/([^/]+)$/)?.[1];
	const title = (p.title ?? '').trim();
	if (!code || !title) return null;
	const role = (p.prettyRole ?? '').trim();
	const specialty = (p.roleSpecificType ?? '').trim();
	const type = (p.type ?? '').trim();
	return {
		key: code,
		company,
		companyUrl: `${BASE}/companies/${slug}`,
		title,
		url: `${BASE}${path}`,
		applyUrl: p.applyUrl ?? '',
		category: [role, specialty && specialty !== role ? specialty : '', type && type !== 'Full-time' ? type : '']
			.filter(Boolean)
			.join(', '),
		sector: tags.filter(Boolean).join(', '),
		location: (p.location ?? '').trim(),
		salary: parseSalary(p.salaryRange),
		postedAt: approxDate(p.createdAt)
	};
}

export const board: JobBoardScraper = {
	async list() {
		const resp = await fetchWithRetry(SITEMAP);
		if (!resp.ok) throw new Error(`ycombinator: the jobs sitemap answered ${resp.status}`);
		const xml = await resp.text();
		const jobUrls = [...xml.matchAll(/<loc>https:\/\/www\.ycombinator\.com\/companies\/([^/<]+)\/jobs\/[^<]+<\/loc>/g)];
		const slugs = [...new Set(jobUrls.map((m) => m[1]))];
		if (slugs.length === 0) throw new Error('ycombinator: the jobs sitemap names no companies');

		let failed = 0;
		const pages = await mapConcurrent(slugs, COMPANY_CONCURRENCY, async (slug) => {
			try {
				const r = await fetchWithRetry(`${BASE}/companies/${slug}`);
				// a company page that is gone takes its jobs with it
				if (r.status === 404) return null;
				if (!r.ok) throw new Error(String(r.status));
				return pageProps(await r.text());
			} catch {
				failed++;
				return null;
			}
		});
		// a few companies failing is noise; many means the site is refusing us,
		// and a partial list must not be mistaken for closures
		if (failed > slugs.length * 0.02) {
			throw new Error(`ycombinator: ${failed} of ${slugs.length} company pages failed`);
		}

		const byKey = new Map<string, ScrapedJob>();
		pages.forEach((props, i) => {
			const slug = slugs[i];
			const company = (props?.company?.name ?? '').trim() || titleFromSlug(slug);
			for (const posting of props?.jobPostings ?? []) {
				const job = toJob(slug, company, props?.company?.tags ?? [], posting);
				if (job && !byKey.has(job.key)) byKey.set(job.key, job);
			}
		});
		// the sitemap keeps the pages of jobs long gone, so it only bounds the
		// list from above; far fewer jobs than it names means pages came back empty
		if (byKey.size < jobUrls.length * 0.5) {
			throw new Error(
				`ycombinator: ${byKey.size} jobs from ${slugs.length} companies while the sitemap names ${jobUrls.length}`
			);
		}
		return [...byKey.values()];
	},

	// the job page carries the description (markdown, as the board keeps it)
	async detail(job) {
		const r = await fetchWithRetry(job.url);
		if (r.status === 404) return null;
		if (!r.ok) throw new Error(`ycombinator: the job page answered ${r.status}`);
		const props = pageProps(await r.text());
		if (!props?.job) return null;
		return { description: props.job.description ?? '' };
	}
};
