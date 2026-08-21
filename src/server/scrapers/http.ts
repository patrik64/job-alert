// the little that every board scraper needs from the network

export const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// worth another try: the server asked us to back off, or fell over
const transient = (status: number) => status === 429 || status >= 500;

// how long to wait before the next attempt: a 429 means a rate limit, which
// lifts in the order of a minute — wait as told, or ever longer; a 5xx or a
// network error is usually over much sooner
function backoff(resp: Response | undefined, attempt: number) {
	const retryAfter = Number(resp?.headers.get('retry-after'));
	if (resp?.status === 429) {
		return retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 30_000);
	}
	return 500 * 2 ** (attempt - 1);
}

export async function fetchWithRetry(
	url: string,
	init: RequestInit = {},
	{ attempts = 6, timeoutMs = 30_000 } = {}
): Promise<Response> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		let resp: Response | undefined;
		try {
			resp = await fetch(url, {
				...init,
				headers: { 'user-agent': UA, ...(init.headers as Record<string, string> | undefined) },
				signal: AbortSignal.timeout(timeoutMs)
			});
			if (!transient(resp.status) || attempt === attempts) return resp;
			lastError = new Error(`${resp.status} ${url}`);
		} catch (err) {
			lastError = err;
			if (attempt === attempts) throw err;
		}
		await sleep(backoff(resp, attempt));
	}
	throw lastError;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
	const resp = await fetchWithRetry(url, init);
	if (!resp.ok) throw new Error(`${resp.status} ${url}`);
	return (await resp.json()) as T;
}

// runs fn over the items with at most `limit` in flight, keeping their order
export async function mapConcurrent<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				results[i] = await fn(items[i], i);
			}
		})
	);
	return results;
}

// spaces out the starts of requests to one host: callers await pace() before
// each request and no two starts come closer than minGapMs, however many of
// them run concurrently
export function pacer(minGapMs: number) {
	let nextStart = 0;
	return async function pace() {
		const now = Date.now();
		const start = Math.max(nextStart, now);
		nextStart = start + minGapMs;
		if (start > now) await sleep(start - now);
	};
}

// boards spell their pay periods differently; the app keeps one short word
export function normalizePeriod(period: string | null | undefined): string {
	const p = (period ?? '').toLowerCase();
	if (/year|annual/.test(p)) return 'year';
	if (/hour/.test(p)) return 'hour';
	if (/month/.test(p)) return 'month';
	if (/week/.test(p)) return 'week';
	if (/day|daily/.test(p)) return 'day';
	return '';
}
