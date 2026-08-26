import { BackendMethod, SqlDatabase, remult, repo } from 'remult';
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

// one operand of a search term: what to look for, and whether it must match a
// field exactly (it was written in quotes) or merely appear in one
interface SearchPart {
	needle: string;
	exact: boolean;
}

// a term parses into an OR of AND-groups: an uppercase OR starts a new group,
// an uppercase AND separates operands within one — so AND binds tighter — and
// a quoted stretch is one operand whatever it says inside. lowercase and/or
// are ordinary text, as is an apostrophe inside a word ("women's health");
// only a '…' standing free the way a "…" does quotes
const parseSearch = (term: string): SearchPart[][] => {
	const groups: SearchPart[][] = [];
	let group: SearchPart[] = [];
	let buf = '';
	const endPart = () => {
		const q = buf.trim();
		buf = '';
		const quoted = q.match(/^"([\s\S]+)"$/) ?? q.match(/^'([\s\S]+)'$/);
		const needle = (quoted?.[1] ?? q).trim();
		if (needle) group.push({ needle, exact: !!quoted });
	};
	const endGroup = () => {
		endPart();
		if (group.length) groups.push(group);
		group = [];
	};
	for (const token of term.match(/"[^"]*"|(?<=^|\s)'[^']*'(?=\s|$)|\s+|[^\s"]+|"/g) ?? []) {
		if (token === 'OR') endGroup();
		else if (token === 'AND') endPart();
		else buf += token;
	}
	endGroup();
	return groups;
};

// whether one job satisfies one operand, the way the comment on searchJobs
// spells out
const partMatches = (job: Job, part: SearchPart): boolean => {
	const key = part.needle.toLowerCase();
	if (!part.exact)
		return [job.title, job.company, job.category, job.sector, job.location].some((s) =>
			s.toLowerCase().includes(key)
		);
	const is = (s: string) => s.trim().toLowerCase() === key;
	const tagged = (tags: string) => tags.toLowerCase().split(',').some((tag) => tag.trim() === key);
	return is(job.title) || is(job.company) || is(job.location) || tagged(job.category) || tagged(job.sector);
};

// a job on the rust jobs page, with where the language turned up: the title,
// the job function, or — for a job whose description is stored — only there;
// closedAt travels as an ISO string, null while the job is listed
export interface RustJob extends SearchHit {
	matchedIn: 'title' | 'function' | 'description';
	closedAt: string | null;
	// the latest fetch's fresh finds — what the nightly announcement names
	isNewcomer: boolean;
}

// the language as a word — "Rust", "RUST", "Rust/Go" — but not "Trust";
// once for js and once for the database's posix engine
export const RUST = /\brust\b/i;
export const RUST_SQL = '\\mrust\\M';

// the ids of the jobs whose stored description mentions a language, given as
// a posix regex, its js twin, and a plain substring the word contains. With
// exactCase the regexes decide about case themselves — React the framework
// against react the verb — instead of matching insensitively. The
// descriptions are html by the thousand: the database matches them, on word
// boundaries, and only the ids travel — unless the data provider is the json
// fallback of local development, which has no sql
export async function describedIds(
	posix: string,
	substring: string,
	word: RegExp,
	exactCase = false
): Promise<string[]> {
	const db = remult.dataProvider;
	return db instanceof SqlDatabase
		? (
				await db.execute(
					`select id from job_details where description ${exactCase ? '~' : '~*'} '${posix}'`
				)
			).rows.map((r) => String(r.id))
		: // a substring query first ("Trust" would come along for rust), the
			// word test after
			(await repo(JobDetail).find({ where: { description: { $contains: substring } }, limit: 100_000 }))
				.filter((d) => word.test(d.description))
				.map((d) => d.id);
}

// the ids of a fund's jobs, each with whether it is closed — all a fetch's
// diff ever reads of the rows already there. The full rows would be the whole
// board over again, megabytes a fund off the database every night; these two
// columns travel instead — unless the data provider is the json fallback of
// local development, which has no sql and loads them whole
async function existingJobIds(slug: string): Promise<{ id: string; closed: boolean }[]> {
	const db = remult.dataProvider;
	return db instanceof SqlDatabase
		? // slug is a key of the scraper registry, checked by the caller — never free text
			(
				await db.execute(
					`select id, "closedAt" is not null as closed from jobs where "fundSlug" = '${slug}'`
				)
			).rows.map((r) => ({ id: String(r.id), closed: Boolean(r.closed) }))
		: (await repo(Job).find({ where: { fundSlug: slug }, limit: 200_000 })).map((j) => ({
				id: j.id,
				closed: !!j.closedAt
			}));
}

// how long one fetch may spend listing a board — the largest getro boards
// run to well over a thousand paced pages, a good three minutes; the rest of
// a nightly fetch (diff, a few inserts) fits in the time a serverless
// function has left after that
const LIST_TIMEOUT_MS = 270_000;
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

// getro's sourcing pads boards with postings lifted straight off linkedin —
// spam and other companies' roles under portfolio names — so a job whose only
// application path is a bare linkedin posting is not imported; ones already in
// the database fall out of the listing and are closed by the ordinary diff
const LINKEDIN_POSTING = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/jobs\/view\//i;

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
						() => reject(new Error(`${entry.name}: scrape timed out after ${LIST_TIMEOUT_MS / 60_000} minutes`)),
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
				if (LINKEDIN_POSTING.test(j.applyUrl ?? '')) continue;
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
			const existing = await existingJobIds(slug);
			const idOf = (key: string) => `${slug}:${key}`;
			const listedIds = new Set([...byKey.keys()].map(idOf));
			const existingIds = new Set(existing.map((j) => j.id));
			const newcomers = [...byKey].filter(([key]) => !existingIds.has(idOf(key)));
			const toClose = existing.filter((j) => !j.closed && !listedIds.has(j.id)).map((j) => j.id);
			const toReopen = existing.filter((j) => j.closed && listedIds.has(j.id)).map((j) => j.id);
			const baseline = existing.length === 0;
			const now = new Date();

			// the previous batch is no longer "new" — cleared only now that the
			// scrape succeeded, so a failed fetch keeps the last newcomer set intact
			await jobs.updateMany({
				where: { fundSlug: slug, isNewcomer: true },
				set: { isNewcomer: false }
			});
			// jobs that left the board are closed — and their descriptions go with
			// them; jobs that came back are reopened, and described afresh
			for (const ids of chunks(toClose, 500)) {
				await jobs.updateMany({ where: { id: { $in: ids } }, set: { closedAt: now } });
				await repo(JobDetail).deleteMany({ where: { id: { $in: ids } } });
			}
			for (const ids of chunks(toReopen, 500)) {
				await jobs.updateMany({
					where: { id: { $in: ids } },
					set: { closedAt: null, ...(entry.board.detail ? { enrichedAt: null } : {}) }
				});
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
							// descriptions are kept for the jobs that turn up after a board's
							// baseline: the baseline is thousands of jobs a board, more than
							// the database has room for, and it is the newcomers that get
							// read. A board without detail has nothing to fetch anyway
							enrichedAt: entry.board.detail && !baseline ? null : now
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
				where: { fundSlug: slug, enrichedAt: NULL_DATE, closedAt: NULL_DATE, baseline: false },
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

	// a term is an OR of AND-groups (see parseSearch). An operand matches a
	// job when any of title, company, category, sector or location contains
	// it — or, written in quotes, when the title, company or location is
	// exactly that, or a category/sector tag is — all case-insensitively.
	// exactness is decided here rather than in the browser, because the rows
	// a substring query returns are capped and the exact ones must not be
	// lost behind that cap. matches come in pages of SEARCH_LIMIT; page asks
	// for the next batch
	@BackendMethod({ allowed: true })
	static async searchJobs(term: string, page = 0): Promise<SearchHit[]> {
		const groups = parseSearch(term);
		if (groups.length === 0) return [];
		const batch = Math.max(0, Math.floor(page));

		// the database narrows by substrings — an exact match is one of those
		// too — and any exact operands are then judged here on the capped rows
		const anyContains = (needle: string) => ({
			$or: [
				{ title: { $contains: needle } },
				{ company: { $contains: needle } },
				{ category: { $contains: needle } },
				{ sector: { $contains: needle } },
				{ location: { $contains: needle } }
			]
		});
		const hasExact = groups.some((g) => g.some((p) => p.exact));
		const rows = await repo(Job).find({
			where: {
				closedAt: NULL_DATE,
				$or: groups.map((g) => ({ $and: g.map((p) => anyContains(p.needle)) }))
			},
			// the id as the last key pins jobs that tie on everything else, so
			// consecutive pages never overlap or leave a gap
			orderBy: { firstSeenAt: 'desc', company: 'asc', title: 'asc', id: 'asc' },
			limit: hasExact ? 100_000 : SEARCH_LIMIT,
			// with an exact operand the filtering happens below, after the
			// fetch — it pages there too
			...(hasExact ? {} : { page: batch + 1 })
		});

		const hits = hasExact
			? rows
					.filter((job) => groups.some((g) => g.every((p) => partMatches(job, p))))
					.slice(batch * SEARCH_LIMIT, (batch + 1) * SEARCH_LIMIT)
			: rows;

		return hits.map((job) => ({
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

	// the listed jobs that have to do with rust: the language named in the
	// title or the job function, or mentioned in the description — of the jobs
	// whose description is stored, that is (see fetchFund). With includeClosed
	// the closed ones come along — by title or function only, since a job's
	// description goes when it closes
	@BackendMethod({ allowed: true })
	static async rustJobs(includeClosed = false): Promise<RustJob[]> {
		const described = await describedIds(RUST_SQL, 'rust', RUST);
		// a substring query first ("Trust" comes along), the word test after
		const rows = await repo(Job).find({
			where: {
				...(includeClosed ? {} : { closedAt: NULL_DATE }),
				$or: [
					{ title: { $contains: 'rust' } },
					{ category: { $contains: 'rust' } },
					...chunks(described, 500).map((ids) => ({ id: { $in: ids } }))
				]
			},
			orderBy: { firstSeenAt: 'desc', company: 'asc', title: 'asc' },
			limit: 100_000
		});
		const mentioned = new Set(described);
		const hits: RustJob[] = [];
		for (const job of rows) {
			const matchedIn = RUST.test(job.title)
				? 'title'
				: RUST.test(job.category)
					? 'function'
					: mentioned.has(job.id)
						? 'description'
						: null;
			if (!matchedIn) continue;
			hits.push({
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
				firstSeenAt: job.firstSeenAt?.toISOString() ?? '',
				matchedIn,
				closedAt: job.closedAt?.toISOString() ?? null,
				isNewcomer: job.isNewcomer
			});
		}
		return hits;
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
