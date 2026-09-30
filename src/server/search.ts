// The search over every listed job. A term is an OR of AND-groups (see
// parseSearch), and each operand of a group matches in one of three ways:
// - a language or trade the feeds follow, named as the feeds name it (rust,
//   go or golang, c++ or cpp, svelte, kotlin, react, devops, product
//   manager): the jobs that feed would take — the word in the title or job
//   function, or for the languages a stored description naming it. So
//   "rust" finds the job whose description alone says Rust, and never
//   "Trust & Safety"
// - in "quotes": a title, company or location that is exactly that, or a
//   whole category/sector tag
// - anything else: each of its words starts a word of the title, company,
//   job function, industry or location — "eng" finds "Engineer", "vienna"
//   finds "Vienna, Austria". A term with other signs in it ("c#", "node.js")
//   must also stand in one of those as written, since the words alone would
//   say too little
// The words go through jobs_search_idx, the word index over those five
// fields (see SEARCH_DOCUMENT). The substring search it replaced read every
// listed job, which on the free tier's cpu took ten seconds and more

import { remult, repo, SqlDatabase } from 'remult';
import { Job } from '../shared/Job';
import {
	describedIds,
	SEARCH_DOCUMENT,
	SEARCH_LIMIT,
	searchWords,
	type SearchHit
} from '../shared/ScrapeController';
import { operator, posix, TOPICS, type Topic, type TopicName } from './feeds';

// one operand of a search term: what to look for, and whether it must match a
// field exactly (it was written in quotes)
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

// the feeds' topics a term can name, each with the words every job its
// patterns take is sure to hold — what the word index narrows by before the
// patterns judge (of "C++" the index keeps only the c)
const TOPIC_WORDS = {
	rust: "'rust':*",
	svelte: "'svelte':*",
	kotlin: "'kotlin':*",
	react: "'react':*",
	go: "'go' | 'golang':*",
	cpp: "'c' | 'cpp':*",
	devops: "'devops':* | 'dev' & 'ops'",
	'product-manager': "'product' & 'manage':*"
} satisfies Partial<Record<TopicName, string>>;
type SearchTopic = keyof typeof TOPIC_WORDS;

const TOPIC_TERMS: Record<string, SearchTopic> = {
	rust: 'rust',
	svelte: 'svelte',
	kotlin: 'kotlin',
	react: 'react',
	go: 'go',
	golang: 'go',
	'c++': 'cpp',
	cpp: 'cpp',
	devops: 'devops',
	'dev ops': 'devops',
	'product manager': 'product-manager'
};

const FIELDS = ['title', 'company', 'category', 'sector', 'location'] as const;

// signs the word index cannot see: "c#" reaches it as c, "node.js" as node
// and js
const SIGNS = /[^\p{L}\p{N}\s-]/u;

// a word as tsquery input takes it: quoted, with its quotes and backslashes
// doubled
const quoted = (word: string) => `'${word.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

// a substring for ilike, its wildcards taken literally
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// each operand's words as the index holds them: split by postgres's own
// parser through the same expression as the jobs' fields, so "Rust/Go" or
// "C++" come apart on both sides alike
async function wordsOf(db: SqlDatabase, needles: string[]): Promise<string[][]> {
	const command = db.createCommand();
	const { rows } = await command.execute(
		`select array(select lexeme from unnest(${searchWords('n.value')})) as words
		 from jsonb_array_elements_text(${command.param(JSON.stringify(needles))}::jsonb)
		   with ordinality as n(value, ord)
		 order by n.ord`
	);
	return rows.map((r) => (r.words as string[] | null) ?? []);
}

export async function searchJobs(term: string, page: number): Promise<SearchHit[]> {
	const groups = parseSearch(term);
	if (groups.length === 0) return [];
	const batch = Math.max(0, Math.floor(page));
	const db = remult.dataProvider;
	if (!(db instanceof SqlDatabase)) return searchWithoutSql(groups, batch);

	const parts = groups.flat();
	const split = await wordsOf(db, parts.map((p) => p.needle));
	const wordsOfPart = new Map(parts.map((p, i) => [p, split[i]]));

	const command = db.createCommand();
	const param = (v: unknown) => command.param(v);
	// a topic's stored descriptions are read once a search, however often the
	// term names it
	const described = new Map<SearchTopic, string>();

	async function condition(part: SearchPart): Promise<string> {
		const topic = part.exact
			? undefined
			: TOPIC_TERMS[part.needle.toLowerCase().replace(/\s+/g, ' ')];
		if (topic) {
			const { title, category, described: prose }: Topic = TOPICS[topic];
			const byWord =
				`(${SEARCH_DOCUMENT} @@ ${param(TOPIC_WORDS[topic])}::tsquery and ` +
				`(j.title ${operator(title)} ${param(posix(title))} or ` +
				`j.category ${operator(category)} ${param(posix(category))}))`;
			if (!prose) return byWord;
			let ids = described.get(topic);
			if (!ids) {
				const keys = await describedIds(prose.posix, prose.substring, prose.word, prose.exactCase);
				ids = param(JSON.stringify(keys));
				described.set(topic, ids);
			}
			return `(${byWord} or j."detailKey" = any(array(select jsonb_array_elements_text(${ids}::jsonb))))`;
		}

		const words = wordsOfPart.get(part) ?? [];
		if (part.exact) {
			const key = param(part.needle.toLowerCase());
			const tagged = (column: string) =>
				`exists (select 1 from unnest(string_to_array(lower(j.${column}), ',')) t where btrim(t) = ${key})`;
			const exact =
				`(lower(btrim(j.title)) = ${key} or lower(btrim(j.company)) = ${key} or ` +
				`lower(btrim(j.location)) = ${key} or ${tagged('category')} or ${tagged('sector')})`;
			// a field that is exactly the term holds every one of its words
			return words.length
				? `(${SEARCH_DOCUMENT} @@ ${param(words.map(quoted).join(' & '))}::tsquery and ${exact})`
				: exact;
		}

		const tests: string[] = [];
		// a word of one letter only stands alone — "c#" in the index is a c, and
		// every word that starts with one would be most of the jobs
		const start = (w: string) => (w.length > 1 ? `${quoted(w)}:*` : quoted(w));
		if (words.length)
			tests.push(`${SEARCH_DOCUMENT} @@ ${param(words.map(start).join(' & '))}::tsquery`);
		if (words.length === 0 || SIGNS.test(part.needle)) {
			const pattern = param(likePattern(part.needle));
			tests.push(`(${FIELDS.map((f) => `j.${f} ilike ${pattern}`).join(' or ')})`);
		}
		return tests.length > 1 ? `(${tests.join(' and ')})` : tests[0];
	}

	const alternatives: string[] = [];
	for (const group of groups) {
		const all: string[] = [];
		for (const part of group) all.push(await condition(part));
		alternatives.push(`(${all.join(' and ')})`);
	}

	// postgres chooses the way in: the index for words few jobs hold, or the
	// jobs newest first for words most hold ("eng"), where a page of matches
	// turns up long before the index would have gathered them all
	const { rows } = await command.execute(
		`select j.id, j."fundSlug", j.company, j."companyUrl", j.title, j.url, j."applyUrl",
		        j.category, j.sector, j.location, j."salaryMin", j."salaryMax",
		        j."salaryCurrency", j."salaryPeriod", j."firstSeenAt"
		 from jobs j
		 where ${alternatives.join(' or ')}
		 order by j."firstSeenAt" desc, j.company, j.title, j.id
		 limit ${SEARCH_LIMIT} offset ${param(batch * SEARCH_LIMIT)}`
	);
	const amount = (v: unknown) => (v == null ? null : Number(v));
	return rows.map((r) => ({
		id: String(r.id),
		fundSlug: String(r.fundSlug),
		company: String(r.company),
		companyUrl: String(r.companyUrl),
		title: String(r.title),
		url: String(r.url),
		applyUrl: String(r.applyUrl),
		category: String(r.category),
		sector: String(r.sector),
		location: String(r.location),
		salaryMin: amount(r.salaryMin),
		salaryMax: amount(r.salaryMax),
		salaryCurrency: String(r.salaryCurrency),
		salaryPeriod: String(r.salaryPeriod),
		firstSeenAt:
			r.firstSeenAt instanceof Date ? r.firstSeenAt.toISOString() : String(r.firstSeenAt ?? '')
	}));
}

// the json fallback of local development has no sql and no word index: its
// operands match as substrings of the five fields — in quotes, exactly — and
// the rows are loaded whole and judged here
async function searchWithoutSql(groups: SearchPart[][], batch: number): Promise<SearchHit[]> {
	const matches = (job: Job, part: SearchPart) => {
		const key = part.needle.toLowerCase();
		if (!part.exact) return FIELDS.some((f) => job[f].toLowerCase().includes(key));
		const is = (s: string) => s.trim().toLowerCase() === key;
		const tagged = (tags: string) =>
			tags
				.toLowerCase()
				.split(',')
				.some((tag) => tag.trim() === key);
		return (
			is(job.title) ||
			is(job.company) ||
			is(job.location) ||
			tagged(job.category) ||
			tagged(job.sector)
		);
	};
	const rows = await repo(Job).find({
		orderBy: { firstSeenAt: 'desc', company: 'asc', title: 'asc', id: 'asc' },
		limit: 1_000_000
	});
	return rows
		.filter((job) => groups.some((g) => g.every((p) => matches(job, p))))
		.slice(batch * SEARCH_LIMIT, (batch + 1) * SEARCH_LIMIT)
		.map((job) => ({
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
