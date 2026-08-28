<script lang="ts">
	import { jobMeta } from '$lib/jobs';
	import { fundName } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController, SEARCH_LIMIT, type SearchHit } from '../../shared/ScrapeController';

	let search = $state('');
	let results = $state<SearchHit[]>([]);
	let searching = $state(false);
	let searched = $state(false);
	let total = $state(0);
	// how many pages of the current term are shown, and whether the last one
	// came back full — a full page may have more behind it
	let pages = $state(1);
	let maybeMore = $state(false);
	let loadingMore = $state(false);

	$effect(() => {
		ScrapeController.countJobs().then((n) => (total = n));
	});

	$effect(() => {
		const q = search.trim();
		if (q.length < 2) {
			results = [];
			searching = false;
			searched = false;
			maybeMore = false;
			return;
		}
		searching = true;
		// debounce; the cleanup cancels the pending query when the user keeps typing
		const timer = setTimeout(async () => {
			const rows = await ScrapeController.searchJobs(q);
			if (q === search.trim()) {
				results = rows;
				pages = 1;
				maybeMore = rows.length === SEARCH_LIMIT;
				searching = false;
				searched = true;
			}
		}, 250);
		return () => clearTimeout(timer);
	});

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		const q = search.trim();
		try {
			const rows = await ScrapeController.searchJobs(q, pages);
			// only if the term hasn't changed under the fetch; a job that slid
			// across the page boundary since the last batch is dropped, since
			// the list is keyed by id
			if (q === search.trim()) {
				const seen = new Set(results.map((r) => r.id));
				results = [...results, ...rows.filter((r) => !seen.has(r.id))];
				pages += 1;
				maybeMore = rows.length === SEARCH_LIMIT;
			}
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>search — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">search</h1>
		<span class="text-sm text-white/80">
			{#if searching}
				searching…
			{:else if searched}
				{maybeMore
					? `first ${results.length.toLocaleString()} matches`
					: `${results.length.toLocaleString()} matches`}
			{:else if total}
				({total.toLocaleString()} jobs)
			{/if}
		</span>
	</div>

	<!-- svelte-ignore a11y_autofocus -->
	<input
		type="text"
		placeholder="search all jobs by title, company, category, sector or location…"
		bind:value={search}
		autofocus
		class="form-input mt-3 w-full focus:shadow-outline-green"
	/>

	{#if !searched && !searching}
		<ul class="mt-6 ml-5 flex list-disc flex-col gap-1.5 text-sm text-white/80">
			<li>
				a term in "quotes" matches exactly: a title, company or location that is exactly that, or
				a whole category/sector tag
			</li>
			<li>
				uppercase <span class="font-semibold">AND</span> and
				<span class="font-semibold">OR</span> combine terms — rust AND vienna,
				svelte OR react
			</li>
			<li>type at least 2 characters to search all listed jobs</li>
		</ul>
	{:else if searched && results.length === 0}
		<p class="mt-6 text-sm text-white/80">no jobs match "{search.trim()}"</p>
	{:else if results.length > 0}
		<ul class="mt-4 divide-y divide-gray-200 rounded-lg bg-white shadow-lg">
			{#each results as job (job.id)}
				{@const meta = jobMeta(job)}
				<li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
					<div class="min-w-0">
						{#if job.url.startsWith('http')}
							<a
								href={job.url}
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium text-gray-800 transition duration-150 hover:text-tertiary-600"
							>
								{job.title}
							</a>
						{:else}
							<span class="font-medium text-gray-800">{job.title}</span>
						{/if}
						<span class="ml-2 text-sm font-medium text-cherry-500">{job.company}</span>
						{#if meta}
							<span class="ml-2 text-xs text-gray-500">{meta}</span>
						{/if}
					</div>
					<div class="flex shrink-0 items-center gap-3 text-xs text-gray-500">
						<a
							href={`/funds/${job.fundSlug}`}
							class="font-semibold transition duration-150 hover:text-tertiary-600"
						>
							{fundName.get(job.fundSlug) ?? job.fundSlug}
						</a>
						<span>
							first seen {job.firstSeenAt ? new Date(job.firstSeenAt).toLocaleDateString() : ''}
						</span>
					</div>
				</li>
			{/each}
		</ul>
		{#if maybeMore}
			<div class="mt-4 flex justify-center">
				<button
					type="button"
					onclick={loadMore}
					disabled={loadingMore}
					class="text-sm font-semibold text-white underline transition duration-150 hover:text-primary-300 disabled:cursor-default disabled:text-white/50 disabled:no-underline"
				>
					{loadingMore ? 'fetching…' : `fetch ${SEARCH_LIMIT} more`}
				</button>
			</div>
		{/if}
	{/if}
</div>
