<script lang="ts">
	import { page } from '$app/state';
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController, type RustJob } from '../../shared/ScrapeController';

	// the timeline's form — days, funds under them, jobs under those — over the
	// listed jobs that have to do with rust, three days at a time: the full
	// list grew long enough that loading it whole weighed on the database, so
	// older stretches sit behind the link at the bottom (?page=1, 2, …)
	let jobs = $state<RustJob[]>([]);
	let older = $state(false);
	let loading = $state(true);
	// the closed ones come back in on request, greyed and badged as on a fund's page
	let includeClosed = $state(false);

	const pageNum = $derived(Math.max(0, Number(page.url.searchParams.get('page') ?? '0') || 0));
	const pageHref = (n: number) => (n > 0 ? `/rust-jobs?page=${n}` : '/rust-jobs');

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	$effect(() => {
		const all = includeClosed;
		const n = pageNum;
		loading = true;
		ScrapeController.rustJobs(all, n).then((window) => {
			if (all === includeClosed && n === pageNum) {
				jobs = window.jobs;
				older = window.older;
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
			<label class="flex cursor-pointer items-center gap-1.5 text-xs select-none">
				<input
					type="checkbox"
					bind:checked={includeClosed}
					class="form-checkbox h-4 w-4 cursor-pointer text-primary-600"
				/>
				include closed
			</label>
		</div>
	</div>

	{#if loading}
		<Spinner label="loading rust jobs" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-white/80">
			{pageNum > 0 ? 'no rust jobs in this stretch' : 'no rust jobs in the last three days'}
		</p>
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

	{#if !loading && (pageNum > 0 || older)}
		<div class="mt-8 flex items-center justify-between text-sm">
			{#if pageNum > 0}
				<a
					href={pageHref(pageNum - 1)}
					class="text-white/80 transition duration-150 hover:text-primary-300"
				>
					← newer rust jobs
				</a>
			{:else}
				<span></span>
			{/if}
			{#if older}
				<a
					href={pageHref(pageNum + 1)}
					class="text-white/80 transition duration-150 hover:text-primary-300"
				>
					next rust jobs →
				</a>
			{/if}
		</div>
	{/if}
</div>
