<script lang="ts">
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { FUNDS } from '../../shared/funds';
	import { RUST_BLUESKY_URL, SITE_NAME } from '../../shared/site';
	import { ScrapeController, type RustJob } from '../../shared/ScrapeController';

	// the timeline's form — days, funds under them, jobs under those — over the
	// listed jobs that have to do with rust. The language is rare enough for
	// all of them to be shown at once, so there is no window to widen here
	let jobs = $state<RustJob[]>([]);
	let loading = $state(true);
	// the closed ones come back in on request, greyed and badged as on a fund's page
	let includeClosed = $state(false);

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	$effect(() => {
		const all = includeClosed;
		loading = true;
		ScrapeController.rustJobs(all).then((rows) => {
			if (all === includeClosed) {
				jobs = rows;
				loading = false;
			}
		});
	});

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
	const closedCount = $derived(jobs.filter((j) => j.closedAt).length);
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
					{(jobs.length - closedCount).toLocaleString()} listed
					{jobs.length - closedCount === 1 ? 'job' : 'jobs'}
					{#if closedCount}
						· {closedCount.toLocaleString()} closed
					{/if}
					· {fundCount}
					{fundCount === 1 ? 'fund' : 'funds'}
				</span>
			{/if}
			<label class="flex cursor-pointer items-center gap-1 text-xs select-none">
				<input type="checkbox" bind:checked={includeClosed} />
				include closed
			</label>
			<a
				href={RUST_BLUESKY_URL}
				target="_blank"
				rel="external noreferrer"
				aria-label="rust jobs on bluesky"
				title="rust jobs on bluesky"
				class="transition duration-150 hover:text-primary-300"
			>
				<svg width="18" height="16" viewBox="0 0 568 501" fill="currentColor">
					<path
						d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.135-1.611 123.121 33.664Z"
					/>
				</svg>
			</a>
		</div>
	</div>

	{#if loading}
		<Spinner label="loading rust jobs" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-white/80">no rust jobs</p>
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
									<li
										class={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 ${job.closedAt ? 'bg-gray-100' : ''}`}
									>
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
										<div class="flex shrink-0 items-center gap-3 text-xs text-gray-500">
											{#if job.closedAt}
												<span class="rounded-full bg-gray-300 px-2 py-0.5 font-semibold text-gray-700">
													closed {new Date(job.closedAt).toLocaleDateString()}
												</span>
											{/if}
											<span>{new Date(job.firstSeenAt).toLocaleTimeString()}</span>
										</div>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>
