<script lang="ts">
	import { page } from '$app/state';
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { Job, NULL_DATE } from '../../../shared/Job';
	import { fundBySlug } from '../../../shared/funds';
	import { SITE_NAME } from '../../../shared/site';

	const slug = $derived(page.params.slug ?? '');
	const fund = $derived(fundBySlug.get(slug));
	const name = $derived(fund?.name ?? slug);

	let jobs = $state<Job[]>([]);
	let loading = $state(true);
	let search = $state('');
	let includeClosed = $state(false);
	// the company groups the reader has opened; rows are rendered for those
	// only — and for every group while a search is narrowing them down
	let opened = $state<Record<string, boolean>>({});

	$effect(() => {
		const current = slug;
		const all = includeClosed;
		loading = true;
		repo(Job)
			// explicit limit — remult's REST API defaults to 100 rows per page
			.find({
				where: { fundSlug: current, ...(all ? {} : { closedAt: NULL_DATE }) },
				orderBy: { company: 'asc', title: 'asc' },
				limit: 100_000
			})
			.then((rows) => {
				if (current === slug && all === includeClosed) {
					jobs = rows;
					loading = false;
				}
			});
	});

	const searching = $derived(search.trim().length > 0);

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return jobs;
		return jobs.filter((j) =>
			[j.company, j.title, j.category, j.sector, j.location].some((s) =>
				s.toLowerCase().includes(q)
			)
		);
	});

	const groups = $derived.by(() => {
		const byCompany = new Map<string, Job[]>();
		for (const j of filtered) {
			const list = byCompany.get(j.company);
			if (list) list.push(j);
			else byCompany.set(j.company, [j]);
		}
		return [...byCompany.entries()].map(([company, rows]) => ({
			company,
			url: rows[0].companyUrl,
			sector: rows[0].sector,
			jobs: rows
		}));
	});
</script>

<svelte:head>
	<title>{name} — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">
			{#if fund}
				<a
					href={fund.url}
					target="_blank"
					rel="noopener noreferrer"
					class="transition duration-150 hover:text-tertiary-600"
				>
					{name}
				</a>
			{:else}
				{name}
			{/if}
		</h1>
		<div class="flex items-center gap-3 text-sm text-gray-600">
			{#if !loading}
				<span>
					{filtered.length.toLocaleString()} of {jobs.length.toLocaleString()} jobs · {groups.length} companies
				</span>
			{/if}
			<label class="flex cursor-pointer items-center gap-1 text-xs select-none">
				<input type="checkbox" bind:checked={includeClosed} />
				include closed
			</label>
		</div>
	</div>

	<input
		type="text"
		placeholder="search company, title, category, sector or location…"
		bind:value={search}
		class="form-input mt-3 w-full focus:shadow-outline-green"
	/>

	{#if loading}
		<Spinner label="loading jobs" />
	{:else if jobs.length === 0}
		<p class="mt-6 text-sm text-gray-600">
			no jobs yet — run a fetch from the <a href="/" class="font-semibold text-tertiary-600">dashboard</a>
		</p>
	{:else}
		<div class="mt-4 flex flex-col gap-3">
			{#each groups as group (group.company)}
				{@const open = searching || !!opened[group.company]}
				<details
					{open}
					ontoggle={(e) => {
						// only the reader's own toggles are remembered, not the ones a
						// search forces open
						if (!searching) opened[group.company] = e.currentTarget.open;
					}}
					class="rounded-lg bg-white shadow-lg"
				>
					<summary
						class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:text-tertiary-600"
					>
						<span class="text-cherry-500">{group.company}</span>
						<span class="ml-1 text-sm font-normal text-gray-500">({group.jobs.length})</span>
						{#if group.sector}
							<span class="ml-2 text-xs font-normal text-gray-500">{group.sector}</span>
						{/if}
					</summary>
					{#if open}
						<ul class="divide-y divide-gray-200 border-t border-gray-200">
							{#if group.url}
								<li class="px-4 py-1 text-xs text-gray-500">
									<a
										href={group.url}
										target="_blank"
										rel="noopener noreferrer"
										class="font-semibold transition duration-150 hover:text-tertiary-600"
									>
										{group.company} on the {name} board ↗
									</a>
								</li>
							{/if}
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
										{#if meta}
											<span class="ml-2 text-xs text-gray-500">{meta}</span>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-3 text-xs text-gray-500">
										{#if job.isNewcomer}
											<span class="rounded-full bg-warning-500 px-2 py-0.5 font-semibold text-white">
												new
											</span>
										{/if}
										{#if job.closedAt}
											<span class="rounded-full bg-gray-300 px-2 py-0.5 font-semibold text-gray-700">
												closed {job.closedAt.toLocaleDateString()}
											</span>
										{/if}
										{#if job.applyUrl.startsWith('http')}
											<a
												href={job.applyUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="font-semibold transition duration-150 hover:text-tertiary-600"
											>
												apply ↗
											</a>
										{/if}
										<span>first seen {job.firstSeenAt?.toLocaleDateString()}</span>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</details>
			{/each}
		</div>
	{/if}
</div>
