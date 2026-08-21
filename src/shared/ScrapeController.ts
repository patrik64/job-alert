import { BackendMethod, repo } from 'remult';
import type { ScrapedJob } from '../server/scrapers/types';
import { Fund } from './Fund';
import { Job, NULL_DATE } from './Job';
import { JobDetail } from './JobDetail';

export interface FetchResult {
	slug: string;
	// jobs the board listed
	total: number;
	added: number;
	closed: number;
	reopened: number;
	// jobs still waiting for their detail (see enrichFund)
	pending: number;
	// the first fetch of a fund imports a baseline: nothing is marked as new
	baseline: boolean;
}

export interface EnrichResult {
	slug: string;
	enriched: number;
	failed: number;
	remaining: number;
}

// a search result row; firstSeenAt travels as an ISO string over the wire
export interface SearchHit {
	id: string;
	fundSlug: string;
	company: string;
	companyUrl: string;
	title: string;
	url: string;
	applyUrl: string;
	category: string;
	sector: string;
	location: string;
	salaryMin: number | null;
	salaryMax: number | null;
	salaryCurrency: string;
	salaryPeriod: string;
	firstSeenAt: string;
}

export const SEARCH_LIMIT = 500;

// how long one fetch may spend listing a board
const LIST_TIMEOUT_MS = 240_000;
// how many jobs one enrichment pass picks up at most, how many detail
// requests it keeps in flight, and how long it runs unless told otherwise
const ENRICH_BATCH = 3000;
const ENRICH_CONCURRENCY = 8;
const ENRICH_BUDGET_MS = 200_000;
// descriptions are html and can run long; beyond this they are cut
const DESCRIPTION_LIMIT = 200_000;

// scraped text often carries html entities ("Abbot&#8217;s", "AI &amp; ML");
// decode once here so every board gets clean titles and names
const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“'
};

const decodeEntities = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
		.replace(/[​‌‍﻿]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

const chunks = <T>(items: T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

const inFlight = new Set<string>();

export class ScrapeController {
	// not transactional: a transaction pins every command to one connection,
	// which serializes thousands of inserts over a high-latency link. Inserts
	// are idempotent by id, so a run cut short is picked up by the next one
	@BackendMethod({ allowed: true, transactional: false })
	static async fetchFund(slug: string): Promise<FetchResult> {
		// This class is client-bundled (it's how @BackendMethod builds its HTTP
		// proxy), but the method body only ever runs on the server. The statically
		// dead !SSR branch lets Vite drop the scrapers from the client build.
		if (!import.meta.env.SSR) throw new Error('fetchFund only runs on the server');
		const { scraperBySlug } = await import('../server/scrapers/index');
		const entry = scraperBySlug.get(slug);
		if (!entry) throw new Error(`unknown fund: ${slug}`);
		if (inFlight.has(slug)) throw new Error(`${entry.name}: fetch already running`);
		inFlight.add(slug);
		try {
			const listed = await Promise.race([
				entry.board.list(),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`${entry.name}: scrape timed out after 4 minutes`)),
						LIST_TIMEOUT_MS
					)
				)
			]);

			// one entry per board job id, with clean text
			const byKey = new Map<string, ScrapedJob>();
			for (const j of listed) {
				const key = (j.key ?? '').trim();
				const title = decodeEntities(j.title ?? '');
				if (!key || !title || byKey.has(key)) continue;
				byKey.set(key, {
					...j,
					title,
					company: decodeEntities(j.company ?? ''),
					category: decodeEntities(j.category ?? ''),
					sector: decodeEntities(j.sector ?? ''),
					location: decodeEntities(j.location ?? '')
				});
			}
			if (byKey.size === 0) throw new Error(`${entry.name}: the board listed no jobs`);

			const jobs = repo(Job);
			const existing = await jobs.find({ where: { fundSlug: slug }, limit: 200_000 });
			const idOf = (key: string) => `${slug}:${key}`;
			const listedIds = new Set([...byKey.keys()].map(idOf));
			const existingIds = new Set(existing.map((j) => j.id));
			const newcomers = [...byKey].filter(([key]) => !existingIds.has(idOf(key)));
			const toClose = existing.filter((j) => !j.closedAt && !listedIds.has(j.id)).map((j) => j.id);
			const toReopen = existing.filter((j) => j.closedAt && listedIds.has(j.id)).map((j) => j.id);
			const baseline = existing.length === 0;
			const now = new Date();

			// the previous batch is no longer "new" — cleared only now that the
			// scrape succeeded, so a failed fetch keeps the last newcomer set intact
			await jobs.updateMany({
				where: { fundSlug: slug, isNewcomer: true },
				set: { isNewcomer: false }
			});
			// jobs that left the board are closed, jobs that came back reopened
			for (const ids of chunks(toClose, 500)) {
				await jobs.updateMany({ where: { id: { $in: ids } }, set: { closedAt: now } });
			}
			for (const ids of chunks(toReopen, 500)) {
				await jobs.updateMany({ where: { id: { $in: ids } }, set: { closedAt: null } });
			}

			// chunked concurrent inserts; the pg pool bounds real concurrency
			for (const batch of chunks(newcomers, 50)) {
				await Promise.all(
					batch.map(([key, j]) =>
						jobs.insert({
							id: idOf(key),
							fundSlug: slug,
							company: j.company,
							companyUrl: j.companyUrl ?? '',
							title: j.title,
							url: j.url ?? '',
							applyUrl: j.applyUrl ?? '',
							category: j.category,
							sector: j.sector,
							location: j.location,
							salaryMin: j.salary?.min ?? null,
							salaryMax: j.salary?.max ?? null,
							salaryCurrency: j.salary?.currency ?? '',
							salaryPeriod: j.salary?.period ?? '',
							postedAt: j.postedAt ?? null,
							isNewcomer: !baseline,
							baseline,
							// a board without detail pages has nothing more to fetch
							enrichedAt: entry.board.detail ? null : now
						})
					)
				);
			}

			const added = baseline ? 0 : newcomers.length;
			const pending = entry.board.detail
				? await jobs.count({ fundSlug: slug, enrichedAt: NULL_DATE, closedAt: NULL_DATE })
				: 0;
			await repo(Fund).upsert({
				where: { slug },
				set: {
					name: entry.name,
					jobCount: byKey.size,
					newCount: added,
					lastFetchedAt: now,
					lastError: '',
					...(baseline ? { baselineAt: now, baselineCount: newcomers.length } : {})
				}
			});
			return {
				slug,
				total: byKey.size,
				added,
				closed: toClose.length,
				reopened: toReopen.length,
				pending,
				baseline
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await repo(Fund)
				.upsert({ where: { slug }, set: { lastError: message } })
				.catch(() => {});
			throw err;
		} finally {
			inFlight.delete(slug);
		}
	}

	// a board that keeps a job's description (and functions) on a page of its
	// own gets those fetched here, a bounded pass at a time, so that one call
	// stays well inside a serverless function's allowance; the caller keeps
	// calling until nothing remains
	@BackendMethod({ allowed: true, transactional: false })
	static async enrichFund(slug: string, budgetMs = ENRICH_BUDGET_MS): Promise<EnrichResult> {
		if (!import.meta.env.SSR) throw new Error('enrichFund only runs on the server');
		const { scraperBySlug } = await import('../server/scrapers/index');
		const entry = scraperBySlug.get(slug);
		if (!entry) throw new Error(`unknown fund: ${slug}`);
		const detail = entry.board.detail;
		if (!detail) return { slug, enriched: 0, failed: 0, remaining: 0 };
		const lock = `enrich:${slug}`;
		if (inFlight.has(lock)) throw new Error(`${entry.name}: enrichment already running`);
		inFlight.add(lock);
		try {
			const deadline = Date.now() + Math.min(Math.max(budgetMs, 1_000), 280_000);
			const jobs = repo(Job);
			// newest first: the newcomers of this run are what gets announced
			const queue = await jobs.find({
				where: { fundSlug: slug, enrichedAt: NULL_DATE, closedAt: NULL_DATE },
				orderBy: { firstSeenAt: 'desc' },
				limit: ENRICH_BATCH
			});
			let enriched = 0;
			let failed = 0;
			await Promise.all(
				Array.from({ length: ENRICH_CONCURRENCY }, async () => {
					let job: Job | undefined;
					while (Date.now() < deadline && (job = queue.shift())) {
						try {
							const d = await detail(job);
							const when = new Date();
							if (d) {
								// one statement each: an update that finds no row is
								// followed by the insert (a retry finds the row)
								const description = d.description.slice(0, DESCRIPTION_LIMIT);
								const details = repo(JobDetail);
								const updated = await details.updateMany({
									where: { id: job.id },
									set: { description }
								});
								if (!updated) await details.insert({ id: job.id, description });
								await jobs.updateMany({
									where: { id: job.id },
									set: {
										enrichedAt: when,
										...(d.category ? { category: decodeEntities(d.category) } : {}),
										...(d.postedAt ? { postedAt: d.postedAt } : {})
									}
								});
							} else {
								// gone from the board: nothing to describe — the next
								// fetch closes it
								await jobs.updateMany({ where: { id: job.id }, set: { enrichedAt: when } });
							}
							enriched++;
						} catch (err) {
							// stays pending, for a later pass to retry
							failed++;
							console.error(`${slug}: ${job.id}: ${err instanceof Error ? err.message : err}`);
						}
					}
				})
			);
			const remaining = await jobs.count({ fundSlug: slug, enrichedAt: NULL_DATE, closedAt: NULL_DATE });
			return { slug, enriched, failed, remaining };
		} finally {
			inFlight.delete(lock);
		}
	}

	// a term in quotes asks for exact matches only: a title, company or
	// location that is exactly that, or a category/sector tag that is — all
	// case-insensitively. exactness is decided here rather than in the
	// browser, because the rows a substring query returns are capped and the
	// exact ones must not be lost behind that cap
	@BackendMethod({ allowed: true })
	static async searchJobs(term: string): Promise<SearchHit[]> {
		const q = term.trim();
		const quoted = q.match(/^"([\s\S]+)"$/) ?? q.match(/^'([\s\S]+)'$/);
		const needle = (quoted?.[1] ?? q).trim();
		if (!needle) return [];

		const rows = await repo(Job).find({
			where: {
				closedAt: NULL_DATE,
				$or: [
					{ title: { $contains: needle } },
					{ company: { $contains: needle } },
					{ category: { $contains: needle } },
					{ sector: { $contains: needle } },
					{ location: { $contains: needle } }
				]
			},
			orderBy: { firstSeenAt: 'desc', company: 'asc', title: 'asc' },
			limit: quoted ? 100_000 : SEARCH_LIMIT
		});

		const key = needle.toLowerCase();
		const is = (s: string) => s.trim().toLowerCase() === key;
		const tagged = (tags: string) => tags.toLowerCase().split(',').some((tag) => tag.trim() === key);
		const hits = quoted
			? rows.filter(
					(job) =>
						is(job.title) ||
						is(job.company) ||
						is(job.location) ||
						tagged(job.category) ||
						tagged(job.sector)
				)
			: rows;

		return hits.slice(0, SEARCH_LIMIT).map((job) => ({
			id: job.id,
			fundSlug: job.fundSlug,
			company: job.company,
			companyUrl: job.companyUrl,
			title: job.title,
			url: job.url,
			applyUrl: job.applyUrl,
			category: job.category,
			sector: job.sector,
			location: job.location,
			salaryMin: job.salaryMin,
			salaryMax: job.salaryMax,
			salaryCurrency: job.salaryCurrency,
			salaryPeriod: job.salaryPeriod,
			firstSeenAt: job.firstSeenAt?.toISOString() ?? ''
		}));
	}

	// the jobs currently listed across all boards (a posting that sits on two
	// boards counts on each)
	@BackendMethod({ allowed: true })
	static async countJobs(): Promise<number> {
		return repo(Job).count({ closedAt: NULL_DATE });
	}

	// "clean" on the newcomers page: acknowledge the current newcomers so the
	// list starts empty until the next fetch finds something new
	@BackendMethod({ allowed: true })
	static async clearNewcomers(): Promise<number> {
		const cleared = await repo(Job).updateMany({
			where: { isNewcomer: true },
			set: { isNewcomer: false }
		});
		await repo(Fund).updateMany({ where: { newCount: { $gt: 0 } }, set: { newCount: 0 } });
		return cleared;
	}
}
