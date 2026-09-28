// The engine behind the bluesky announcements: posts assembled part by part,
// composed into a thread of one line per item — as many posts as the list
// takes — and published over the AT Protocol XRPC endpoints. Plain Node, no
// dependencies.
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

// cut to at most n graphemes, an ellipsis marking the cut
function clip(text, n) {
	const parts = [...segmenter.segment(text)].map((p) => p.segment);
	return parts.length <= n ? text : `${parts.slice(0, n - 1).join('')}…`;
}

// the headline, then one line per item — its label linking to the item's
// url, a note after it in brackets — carried over into as many posts as the
// list takes; the closing lines and the link to the page the announcement
// stands for come last. items are [{ label, url, note }], the footer is
// { label, url }
export function composeList(headline, items, closing, footer) {
	const posts = [];
	let post = new Post(POST_LIMIT).add(headline);
	for (const item of items) {
		const note = item.note ? ` (${item.note})` : '';
		const uri = item.url?.startsWith('http') ? item.url : undefined;
		let lead = post.hasBody ? '\n' : '\n\n';
		if (!post.fits(lead + item.label + note)) {
			// the post is full — the line opens the next one
			posts.push(post);
			post = new Post(POST_LIMIT);
			lead = '';
		}
		// a line longer than a whole post gives up the end of its label
		const label = clip(item.label, POST_LIMIT - graphemes(note));
		post.add(lead).add(label, uri);
		if (note) post.add(note);
		post.hasBody = true;
	}
	const tail = `${closing}\n\n${footer.label}`;
	if (!post.fits(`\n\n${tail}`)) {
		posts.push(post);
		post = new Post(POST_LIMIT);
	} else {
		post.add('\n\n');
	}
	post.add(`${closing}\n\n`).add(footer.label, footer.url);
	posts.push(post);
	return posts;
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
