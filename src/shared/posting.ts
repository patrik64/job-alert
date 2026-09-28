// The key a job's description is stored under (Job.detailKey): the posting's
// own link, stripped of what differs between the boards that list it. Boards
// and job sites hang tags on a link to say where a visitor came from —
// utm_source=getro, gh_src=…, lever-source[]=… — and the same posting
// carries different ones on different funds' boards, so those go, and so
// does the fragment. The rest of the query stays, in a fixed order: some
// sites tell their postings apart only there (stripe.com/jobs/search?gh_jid=…,
// a job site's viewjob?jk=…), and cutting it would file every one of them
// under the same key and the same description. A job without a real link
// keeps its own id and shares with nobody.
//
// Plain typescript that imports nothing: a maintenance script runs it
// straight in node, which strips the types.

const TRACKING =
	/^(utm_.*|gh_src|gh_source|lever-(source|origin|via)(\[\])?|source|src|ref|referrer|referer|from|trk|lang|pvs|hubs_.*|_hs.*|mc_(cid|eid)|fbclid|gclid|:~:text)$/i;

// a query parameter's name, percent-decoded where it can be
function nameOf(param: string): string {
	const name = param.split('=')[0];
	try {
		return decodeURIComponent(name.replace(/\+/g, ' '));
	} catch {
		return name;
	}
}

export function postingKey(applyUrl: string, id: string): string {
	const url = applyUrl.trim().split('#')[0];
	if (!/^https?:\/\//i.test(url)) return id;
	const at = url.indexOf('?');
	if (at < 0) return url;
	const kept = url
		.slice(at + 1)
		.split('&')
		.filter((param) => param && !TRACKING.test(nameOf(param)))
		.sort();
	return kept.length ? `${url.slice(0, at)}?${kept.join('&')}` : url.slice(0, at);
}
