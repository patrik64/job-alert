<script lang="ts">
	import { dev } from '$app/environment';
	import { repo } from 'remult';
	import Spinner from '$lib/components/Spinner.svelte';
	import { jobMeta } from '$lib/jobs';
	import { Job } from '../../shared/Job';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';
	import { ScrapeController } from '../../shared/ScrapeController';

	let newcomers = $state<Job[]>([]);
	let loading = $state(true);
	let cleaning = $state(false);

	async function clean() {
		if (cleaning) return;
		cleaning = true;
		try {
			await ScrapeController.clearNewcomers();
			newcomers = [];
		} finally {
			cleaning = false;
		}
	}

	$effect(() => {
		repo(Job)
			// explicit limit — remult's REST API defaults to 100 rows per page
			.find({
				where: { isNewcomer: true },
				orderBy: { company: 'asc', title: 'asc' },
				limit: 100_000
			})
			.then((rows) => {
				newcomers = rows;
				loading = false;
			});
	});

	const groups = $derived(
		FUNDS.map((f) => ({ ...f, jobs: newcomers.filter((j) => j.fundSlug === f.slug) })).filter(
			(g) => g.jobs.length > 0
		)
	);
</script>

<svelte:head>
	<title>newcomers — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">newcomers</h1>
		{#if !loading}
			<div class="flex items-center gap-3">
				<span class="text-sm text-gray-600">
					{newcomers.length.toLocaleString()} new {newcomers.length === 1 ? 'job' : 'jobs'}
				</span>
				{#if dev && newcomers.length > 0}
					<button
						type="button"
						onclick={clean}
						disabled={cleaning}
						class="rounded-md border border-transparent bg-primary-600 px-4 py-1 text-sm leading-5 font-semibold text-white shadow-sm transition duration-150 ease-in-out hover:bg-primary-400 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-gray-300"
					>
						{cleaning ? 'cleaning…' : 'clean'}
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if loading}
		<Spinner label="loading newcomers" />
	{:else if groups.length === 0}
		<p class="mt-6 text-sm text-gray-600">
			no newcomers — run a fetch from the <a href="/" class="font-semibold text-tertiary-600">dashboard</a>
		</p>
	{:else}
		<div class="mt-4 flex flex-col gap-4">
			{#each groups as group (group.slug)}
				<details class="rounded-lg bg-white shadow-lg" open>
					<summary
						class="cursor-pointer px-4 py-3 font-semibold text-gray-800 transition duration-150 select-none hover:text-tertiary-600"
					>
						{group.name}
						<span class="ml-1 text-sm font-normal text-gray-500">({group.jobs.length})</span>
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
									<span class="ml-2 text-sm text-gray-600">{job.company}</span>
									{#if meta}
										<span class="ml-2 text-xs text-gray-500">{meta}</span>
									{/if}
								</div>
								<span class="shrink-0 text-xs text-gray-500">
									first seen {job.firstSeenAt?.toLocaleDateString()}
								</span>
							</li>
						{/each}
					</ul>
				</details>
			{/each}
		</div>
	{/if}
</div>
