<script lang="ts">
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { Fund } from '../../shared/Fund';
	import { Job } from '../../shared/Job';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController } from '../../shared/ScrapeController';

	// the timeline shows a window of recent days; "show earlier" pulls the
	// next fourteen onto the page — each click reads only its own stretch off
	// the database, the days already shown stay as they are
	const WINDOW_DAYS = 14;
	const MAX_WINDOWS = 8;
	let pagesLoaded = $state(0);
	let older = $state(false);
	let loadingMore = $state(false);
	let includeBaselines = $state(false);
	let jobs = $state<Job[]>([]);
	let funds = $state<Fund[]>([]);
	let loading = $state(true);
	let total = $state(0);

	// local YYYY-MM-DD key so day boundaries follow the viewer's timezone
	const dayKey = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	// the first local midnight of the nth window back from today
	const windowStart = (n: number) => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - (WINDOW_DAYS * (n + 1) - 1));
		return d;
	};
	const since = $derived(windowStart(Math.max(pagesLoaded, 1) - 1));

	async function loadWindow(n: number) {
		const start = windowStart(n);
		// a fund's baseline import is thousands of rows; it is shown from the
		// fund's count instead, so only the genuine newcomers are loaded
		// (explicit limit — remult's REST API defaults to 100 rows per page)
		const rows = await repo(Job).find({
			where: {
				baseline: false,
				// the newest window stays open at the top; midnight passing
				// between clicks makes the seams overlap, and the id dedupe
				// below absorbs it
				firstSeenAt: n === 0 ? { $gte: start } : { $gte: start, $lt: windowStart(n - 1) }
			},
			orderBy: { firstSeenAt: 'desc' },
			limit: 100_000
		});
		const seen = new Set(jobs.map((j) => j.id));
		jobs = [...jobs, ...rows.filter((j) => !seen.has(j.id))];
		// whether an earlier stretch still holds something — a count, so no
		// rows travel
		older = (await repo(Job).count({ baseline: false, firstSeenAt: { $lt: start } })) > 0;
		pagesLoaded = n + 1;
	}

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		await loadWindow(pagesLoaded);
		loadingMore = false;
	}

	$effect(() => {
		ScrapeController.countJobs().then((n) => (total = n));
	});

	$effect(() => {
		loading = true;
		Promise.all([loadWindow(0), repo(Fund).find({ limit: 1000 }).then((f) => (funds = f))]).then(
			() => (loading = false)
		);
	});

	// the rss feed links a night as /timeline#YYYY-MM-DD; the days only exist
	// once the rows are in, so the jump happens here rather than on page load —
	// pulling earlier windows first when the night lies beyond what is shown
	$effect(() => {
		if (loading || days.length === 0) return;
		const target = location.hash.slice(1);
		if (!target) return;
		if (target < dayKey(since) && pagesLoaded < MAX_WINDOWS) {
			void loadMore();
			return;
		}
		document.getElementById(target)?.scrollIntoView();
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
		// a fund's baseline import lands on its day as a count — when asked for
		const baselines = new Map<string, Map<string, number>>();
		if (includeBaselines) {
			for (const f of funds) {
				if (!f.baselineAt || f.baselineAt < since) continue;
				const key = dayKey(f.baselineAt);
				if (!byDay.has(key)) byDay.set(key, []);
				const perFund = baselines.get(key) ?? new Map<string, number>();
				perFund.set(f.slug, f.baselineCount);
				baselines.set(key, perFund);
			}
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
		<div class="flex flex-wrap items-center gap-4">
			{#if !loading && total}
				<span class="text-sm text-white/80">
					{total.toLocaleString()} listed jobs · since {since.toLocaleDateString()}
				</span>
			{/if}
			<label class="flex cursor-pointer items-center gap-1.5 text-xs text-white select-none">
				<input
					type="checkbox"
					bind:checked={includeBaselines}
					class="form-checkbox h-4 w-4 cursor-pointer text-primary-600"
				/>
				include baseline imports
			</label>
		</div>
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
		{#if older}
			<div class="mt-6 flex justify-center">
				<button
					type="button"
					onclick={loadMore}
					disabled={loadingMore}
					class="rounded-md px-3 py-1 text-sm font-semibold text-white transition duration-150 ease-in-out hover:bg-white/20 focus:shadow-outline-green focus:outline-none disabled:opacity-50"
				>
					{loadingMore ? 'loading…' : 'show earlier'}
				</button>
			</div>
		{/if}
	{/if}
</div>
