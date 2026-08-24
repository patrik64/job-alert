// The engine the announcement scripts share: posts assembled part by part,
// composed into a short thread — or a single post of counts per fund when the
// night is too busy for names — and published over the AT Protocol XRPC
// endpoints. Plain Node, no dependencies.
//
// Credentials come from the environment:
//   BLUESKY_IDENTIFIER    handle or did of the account to post as
//   BLUESKY_APP_PASSWORD  an app password from bsky settings — never the
//                         account password itself

const SERVICE = process.env.BLUESKY_SERVICE ?? 'https://bsky.social';
const IDENTIFIER = process.env.BLUESKY_IDENTIFIER;
const PASSWORD = process.env.BLUESKY_APP_PASSWORD;

// bluesky counts graphemes, not characters, and stops at 300
const POST_LIMIT = 300;
// beyond a short thread the naming turns into a count per fund instead
const MAX_POSTS = 3;

const segmenter = new Intl.Segmenter();
const graphemes = (s) => [...segmenter.segment(s)].length;

// a post is assembled from parts because bluesky addresses its rich text by
// utf-8 byte offset — recording the parts as they land is cheaper and safer
// than searching the finished string for the pieces that should be links
class Post {
	constructor(limit) {
		this.limit = limit;
		this.parts = [];
		this.hasBody = false;
	}

	get text() {
		return this.parts.map((p) => p.text).join('');
	}

	get length() {
		return graphemes(this.text);
	}

	fits(text) {
		return graphemes(this.text + text) <= this.limit;
	}

	add(text, uri) {
		this.parts.push({ text, uri });
		return this;
	}

	facets() {
		const encoder = new TextEncoder();
		const facets = [];
		let offset = 0;
		for (const part of this.parts) {
			const bytes = encoder.encode(part.text).length;
			if (part.uri) {
				facets.push({
					index: { byteStart: offset, byteEnd: offset + bytes },
					features: [{ $type: 'app.bsky.richtext.facet#link', uri: part.uri }]
				});
			}
			offset += bytes;
		}
		return facets;
	}
}

// a fund's line opens right after the headline, under the previous line, or at
// the very top when it has been carried over into a fresh post
const openLine = (post, fund) =>
	`${post.parts.length === 0 ? '' : post.hasBody ? '\n' : '\n\n'}${fund}: `;

// every job by company and title, each linking to its page on the board
function composeDetailed(groups, headline, footer) {
	const reserved = graphemes(`\n\n${footer.label}`);
	const posts = [];
	let post = new Post(POST_LIMIT - reserved).add(headline);

	for (const group of groups) {
		let open = false;
		for (const job of group.jobs) {
			const uri = job.url.startsWith('http') ? job.url : undefined;
			const lead = open ? ', ' : openLine(post, group.name);
			if (!post.fits(lead + job.label)) {
				// the post is full — carry the rest of the group into a new one
				posts.push(post);
				post = new Post(POST_LIMIT);
				post.add(openLine(post, group.name));
				open = false;
			} else {
				post.add(lead);
			}
			post.hasBody = true;
			post.add(job.label, uri);
			open = true;
		}
	}
	posts.push(post);
	posts[0].add('\n\n').add(footer.label, footer.url);
	return posts;
}

// a busy night (and most nights are, on boards this size) reads better as
// counts than as a wall of titles, and fits in a single post
function composeSummary(groups, headline, footer) {
	const reserved = graphemes(`\n\n${footer.label}`);
	const post = new Post(POST_LIMIT - reserved).add(headline);
	const more = (n) => `\n+${n} more fund${n === 1 ? '' : 's'}`;

	let shown = 0;
	for (const group of groups) {
		const line = `${post.hasBody ? '\n' : '\n\n'}${group.name}: ${group.jobs.length}`;
		const rest = groups.length - shown - 1;
		if (!post.fits(line + (rest > 0 ? more(rest) : ''))) break;
		post.add(line);
		post.hasBody = true;
		shown++;
	}
	if (shown < groups.length) post.add(more(groups.length - shown));

	post.add('\n\n').add(footer.label, footer.url);
	return [post];
}

// names when they fit in a short thread, counts when they don't; groups are
// [{ name, jobs: [{ label, url }] }], the footer { label, url } links the page
// the announcement stands for
export function compose(groups, headline, footer) {
	const detailed = composeDetailed(groups, headline, footer);
	return detailed.length <= MAX_POSTS && detailed.every((p) => p.length <= POST_LIMIT)
		? detailed
		: composeSummary(groups, headline, footer);
}

async function login() {
	const resp = await fetch(`${SERVICE}/xrpc/com.atproto.server.createSession`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD })
	});
	if (!resp.ok) {
		// the body echoes the identifier but never the password
		throw new Error(`bluesky login failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
	}
	return resp.json();
}

async function publish(session, post, reply) {
	const record = {
		$type: 'app.bsky.feed.post',
		text: post.text,
		createdAt: new Date().toISOString(),
		langs: ['en']
	};
	const facets = post.facets();
	if (facets.length) record.facets = facets;
	if (reply) record.reply = reply;

	const resp = await fetch(`${SERVICE}/xrpc/com.atproto.repo.createRecord`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.accessJwt}`
		},
		body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record })
	});
	if (!resp.ok) {
		throw new Error(`bluesky post failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
	}
	return resp.json();
}

// proves the app password works without saying anything out loud
export async function checkCredentials() {
	if (!IDENTIFIER || !PASSWORD) {
		console.error('BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD must both be set');
		process.exit(1);
	}
	const session = await login();
	console.log(`signed in to bluesky as @${session.handle} (${session.did})`);
}

// prints the thread and, unless this is a dry run or the password is missing,
// publishes it; returns the thread's url, or null when nothing went out
export async function postThread(posts, { dryRun = false } = {}) {
	for (const [i, post] of posts.entries()) {
		console.log(`--- post ${i + 1}/${posts.length} (${post.length} graphemes)\n${post.text}\n`);
		if (!dryRun) continue;
		// read the links back out of the finished text the way bluesky will
		const bytes = new TextEncoder().encode(post.text);
		for (const facet of post.facets()) {
			const label = new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd));
			console.log(`    link ${JSON.stringify(label)} -> ${facet.features[0].uri}`);
		}
		console.log();
	}

	if (dryRun) {
		console.log('dry run — nothing was posted');
		return null;
	}
	if (!PASSWORD) {
		console.log('BLUESKY_APP_PASSWORD is not set — nothing was posted');
		return null;
	}

	const session = await login();
	let root;
	let parent;
	for (const post of posts) {
		const reply = root ? { root, parent } : undefined;
		const created = await publish(session, post, reply);
		root ??= { uri: created.uri, cid: created.cid };
		parent = { uri: created.uri, cid: created.cid };
	}

	const url = `https://bsky.app/profile/${session.handle}/post/${root.uri.split('/').pop()}`;
	console.log(`posted ${posts.length === 1 ? 'to' : `a ${posts.length}-post thread on`} bluesky: ${url}`);
	return url;
}
