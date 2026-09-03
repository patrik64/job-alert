<script lang="ts">
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController, type RustJob } from '../../shared/ScrapeController';

	// the timeline's form — days, funds under them, jobs under those — over the
	// listed jobs that have to do with rust, three days at a time: the full
	// list grew long enough that loading it whole weighed on the database. The
	// link at the bottom pulls three more days onto the page each time
	let jobs = $state<RustJob[]>([]);
	let older = $state(false);
	let loading = $state(true);
	let loadingMore = $state(false);
	// how many windows the page holds — read only in the handlers, so plain
	let pagesLoaded = 0;

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	$effect(() => {
		loading = true;
		ScrapeController.rustJobs(0).then((window) => {
			jobs = window.jobs;
			older = window.older;
			pagesLoaded = 1;
			loading = false;
		});
	});

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		const window = await ScrapeController.rustJobs(pagesLoaded);
		// the windows drift with the clock between requests, so the seam can
		// serve a row twice
		const seen = new Set(jobs.map((j) => j.id));
		jobs = [...jobs, ...window.jobs.filter((j) => !seen.has(j.id))];
		older = window.older;
		pagesLoaded += 1;
		loadingMore = false;
	}

	const days = $derived.by(() => {
		const byDay = new Map<string, RustJob[]>();
		for (const j of jobs) {
			if (!j.firstSeenAt) continue;
			const key = dayKey(new Date(j.firstSeenAt));
			const list = byDay.get(key);
			if (list) list.push(j);
			else byDay.set(key, [j]);
		}
		return [...byDay.entries()]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([day, rows]) => {
				const groups = FUNDS.map((f) => ({
					...f,
					jobs: rows.filter((j) => j.fundSlug === f.slug)
				})).filter((g) => g.jobs.length > 0);
				return {
					day,
					label: new Date(`${day}T00:00:00`).toLocaleDateString(),
					total: groups.reduce((n, g) => n + g.jobs.length, 0),
					funds: groups
				};
			});
	});

	const fundCount = $derived(new Set(jobs.map((j) => j.fundSlug)).size);
</script>

<svelte:head>
	<title>rust jobs — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">rust jobs</h1>
		<div class="flex items-center gap-3 text-sm text-white/80">
			{#if !loading && jobs.length}
				<span>
					{jobs.length.toLocaleString()}
					{jobs.length === 1 ? 'job' : 'jobs'}
					· {fundCount}
					{fundCount === 1 ? 'fund' : 'funds'}
				</span>
			{/if}
		</div>
	</div>

	{#if loading}
		<Spinner label="loading rust jobs" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-white/80">no rust jobs in the last three days</p>
	{:else}
		{#each days as day (day.day)}
			<div id={day.day} class="mt-6 scroll-mt-4">
				<h2 class="font-semibold text-white">
					{day.label}
					<span class="ml-1 text-sm font-normal text-white/70">
						({day.total.toLocaleString()} {day.total === 1 ? 'job' : 'jobs'})
					</span>
				</h2>
				<div class="mt-3 flex flex-col gap-3">
					{#each day.funds as group (group.slug)}
						<details class="rounded-lg bg-white shadow-lg">
							<summary
								class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:text-tertiary-600"
							>
								{group.name}
								<span class="ml-1 text-sm font-normal text-gray-500">
									({group.jobs.length.toLocaleString()})
								</span>
							</summary>
							<ul class="divide-y divide-gray-200 border-t border-gray-200">
								{#each group.jobs as job (job.id)}
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
											{#if job.matchedIn === 'description'}
												<!-- the title keeps quiet about it: the description names the language -->
												<span class="ml-2 text-xs text-gray-500 italic">mentions rust</span>
											{/if}
										</div>
										<span class="shrink-0 text-xs text-gray-500">
											{new Date(job.firstSeenAt).toLocaleTimeString()}
										</span>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
			</div>
		{/each}
	{/if}

	{#if !loading && older}
		<div class="mt-8 flex justify-center text-sm">
			<button
				type="button"
				onclick={loadMore}
				disabled={loadingMore}
				class="cursor-pointer font-semibold text-white transition duration-150 hover:text-primary-300 disabled:opacity-50"
			>
				{loadingMore ? 'loading…' : 'more rust jobs'}
			</button>
		</div>
	{/if}
</div>
