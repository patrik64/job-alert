<script lang="ts">
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { Fund } from '../../shared/Fund';
	import { Job } from '../../shared/Job';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController } from '../../shared/ScrapeController';

	// the timeline shows a window of recent days; "show earlier" widens it
	const WINDOW_DAYS = 14;
	let windows = $state(1);
	let jobs = $state<Job[]>([]);
	let funds = $state<Fund[]>([]);
	let loading = $state(true);
	let total = $state(0);

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	// the first local midnight inside the window
	const since = $derived.by(() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - WINDOW_DAYS * windows + 1);
		return d;
	});

	$effect(() => {
		ScrapeController.countJobs().then((n) => (total = n));
	});

	$effect(() => {
		const from = since;
		loading = true;
		Promise.all([
			// a fund's baseline import is thousands of rows; it is shown from the
			// fund's count instead, so only the genuine newcomers are loaded
			// (explicit limit — remult's REST API defaults to 100 rows per page)
			repo(Job).find({
				where: { baseline: false, firstSeenAt: { $gte: from } },
				orderBy: { firstSeenAt: 'desc' },
				limit: 100_000
			}),
			repo(Fund).find({ limit: 1000 })
		]).then(([rows, fundRows]) => {
			if (from === since) {
				jobs = rows;
				funds = fundRows;
				loading = false;
			}
		});
	});

	const days = $derived.by(() => {
		const byDay = new Map<string, Job[]>();
		for (const j of jobs) {
			if (!j.firstSeenAt) continue;
			const key = dayKey(j.firstSeenAt);
			const list = byDay.get(key);
			if (list) list.push(j);
			else byDay.set(key, [j]);
		}
		// a fund's baseline import lands on its day as a count
		const baselines = new Map<string, Map<string, number>>();
		for (const f of funds) {
			if (!f.baselineAt || f.baselineAt < since) continue;
			const key = dayKey(f.baselineAt);
			if (!byDay.has(key)) byDay.set(key, []);
			const perFund = baselines.get(key) ?? new Map<string, number>();
			perFund.set(f.slug, f.baselineCount);
			baselines.set(key, perFund);
		}
		return [...byDay.entries()]
			.sort((a, b) => (a[0] < b[0] ? 1 : -1))
			.map(([day, rows]) => {
				const groups = FUNDS.map((f) => ({
					...f,
					jobs: rows.filter((j) => j.fundSlug === f.slug),
					baselineCount: baselines.get(day)?.get(f.slug) ?? 0
				})).filter((g) => g.jobs.length > 0 || g.baselineCount > 0);
				return {
					day,
					label: new Date(`${day}T00:00:00`).toLocaleDateString(),
					total: groups.reduce((n, g) => n + g.jobs.length + g.baselineCount, 0),
					funds: groups
				};
			});
	});
</script>

<svelte:head>
	<title>timeline — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">timeline</h1>
		{#if !loading && total}
			<span class="text-sm text-white/80">
				{total.toLocaleString()} listed jobs · since {since.toLocaleDateString()}
			</span>
		{/if}
	</div>

	{#if loading}
		<Spinner label="loading timeline" />
	{:else if days.length === 0}
		<p class="mt-6 text-sm text-white/80">
			nothing since {since.toLocaleDateString()} — run a fetch from the
			<a href="/" class="font-semibold text-white underline">dashboard</a>
		</p>
	{:else}
		{#each days as day (day.day)}
			<div class="mt-6">
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
									({(group.jobs.length + group.baselineCount).toLocaleString()})
								</span>
								{#if group.baselineCount}
									<span class="ml-1 rounded bg-baseline px-1.5 py-0.5 text-xs font-normal text-gray-600">
										baseline import
									</span>
								{/if}
							</summary>
							<ul class="divide-y divide-gray-200 border-t border-gray-200">
								{#if group.baselineCount}
									<li class="bg-baseline px-4 py-2 text-sm text-gray-600">
										{group.baselineCount.toLocaleString()} jobs imported as the baseline — see the
										<a href={`/funds/${group.slug}`} class="font-semibold text-tertiary-600">fund page</a>
									</li>
								{/if}
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
										</div>
										<span class="shrink-0 text-xs text-gray-500">
											{job.firstSeenAt?.toLocaleTimeString()}
										</span>
									</li>
								{/each}
							</ul>
						</details>
					{/each}
				</div>
			</div>
		{/each}
		<div class="mt-6 flex justify-center">
			<button
				type="button"
				onclick={() => (windows += 1)}
				class="rounded-md px-3 py-1 text-sm font-semibold text-white transition duration-150 ease-in-out hover:bg-white/20 focus:shadow-outline-green focus:outline-none"
			>
				show earlier
			</button>
		</div>
	{/if}
</div>
