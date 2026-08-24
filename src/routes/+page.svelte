<script lang="ts">
	import { dev } from '$app/environment';
	import { repo } from 'remult';
	import { Fund } from '../shared/Fund';
	import { FUNDS } from '../shared/funds';
	import { RUST_BLUESKY_URL, SITE_NAME } from '../shared/site';
	import { ScrapeController } from '../shared/ScrapeController';

	type Status = 'pending' | 'running' | 'enriching' | 'done' | 'error';

	let funds = $state<Record<string, Fund>>({});
	let statuses = $state<Record<string, Status>>({});
	let running = $state(false);

	const cards = $derived(
		FUNDS.map((f) => ({ ...f, fund: funds[f.slug], status: statuses[f.slug] }))
	);

	async function reloadFunds() {
		// explicit limit — remult's REST API defaults to 100 rows per page
		const rows = await repo(Fund).find({ limit: 1000 });
		funds = Object.fromEntries(rows.map((f) => [f.slug, f]));
	}

	$effect(() => {
		reloadFunds();
	});

	async function runFetch(slug: string) {
		statuses[slug] = 'running';
		try {
			const result = await ScrapeController.fetchFund(slug);
			await reloadFunds();
			// a board that keeps descriptions on pages of their own is enriched
			// in bounded passes until nothing is left
			let pending = result.pending;
			for (let pass = 0; pending > 0 && pass < 30; pass++) {
				statuses[slug] = 'enriching';
				const r = await ScrapeController.enrichFund(slug);
				pending = r.remaining;
				if (r.enriched === 0) break;
			}
			statuses[slug] = 'done';
		} catch {
			statuses[slug] = 'error';
		}
		await reloadFunds();
	}

	async function fetchOne(slug: string) {
		if (running || statuses[slug] === 'running' || statuses[slug] === 'enriching') return;
		await runFetch(slug);
	}

	async function fetchAll() {
		if (running) return;
		running = true;
		statuses = Object.fromEntries(FUNDS.map((f) => [f.slug, 'pending' as Status]));
		const queue = FUNDS.map((f) => f.slug);
		// one fund at a time — boards on the same platform share one paced
		// request budget; one fund failing doesn't stop the rest
		await Promise.all(
			Array.from({ length: 1 }, async () => {
				let slug: string | undefined;
				while ((slug = queue.shift())) {
					await runFetch(slug);
				}
			})
		);
		running = false;
	}

	const chipClasses: Record<Status, string> = {
		pending: 'bg-gray-200 text-gray-600',
		running: 'animate-pulse bg-tertiary-500 text-white',
		enriching: 'animate-pulse bg-secondary-500 text-white',
		done: 'bg-success-500 text-white',
		error: 'bg-danger-500 text-white'
	};
</script>

<svelte:head>
	<title>{SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[71rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">funds</h1>
		<div class="flex items-center gap-3">
			{#if dev}
				<button
					type="button"
					onclick={fetchAll}
					disabled={running}
					class="rounded-md border border-transparent bg-primary-600 px-4 py-1 text-sm leading-5 font-semibold text-white shadow-sm transition duration-150 ease-in-out hover:bg-primary-400 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-gray-300"
				>
					{running ? 'fetching…' : 'fetch all'}
				</button>
			{/if}
			<a
				href={RUST_BLUESKY_URL}
				target="_blank"
				rel="external noreferrer"
				aria-label="rust jobs on bluesky"
				title="rust jobs on bluesky"
				class="text-white/80 transition duration-150 hover:text-primary-300"
			>
				<svg width="20" height="18" viewBox="0 0 568 501" fill="currentColor">
					<path
						d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.135-1.611 123.121 33.664Z"
					/>
				</svg>
			</a>
		</div>
	</div>

	<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each cards as card (card.slug)}
			<div
				class="group relative rounded-lg bg-white px-4 py-3 shadow-lg transition duration-500 ease-in-out hover:bg-light-500"
			>
				<div class="flex items-start justify-between gap-2">
					<!-- stretched link: the ::after overlay makes the whole card clickable -->
					<a
						href={`/funds/${card.slug}`}
						class="font-semibold text-gray-800 transition duration-150 after:absolute after:inset-0 group-hover:text-tertiary-600"
					>
						{card.name}
					</a>
					{#if card.status}
						<span class={`rounded-full px-2 py-0.5 text-xs font-semibold ${chipClasses[card.status]}`}>
							{card.status}
						</span>
					{/if}
				</div>
				<div class="mt-2 flex items-center gap-2 text-sm text-gray-600">
					<span>{card.fund ? `${card.fund.jobCount.toLocaleString()} jobs` : 'never fetched'}</span>
					{#if card.fund && card.fund.newCount > 0}
						<span class="rounded-full bg-warning-500 px-2 py-0.5 text-xs font-semibold text-white">
							+{card.fund.newCount} new
						</span>
					{/if}
				</div>
				<div class="mt-1 flex items-center justify-between gap-2 text-xs text-gray-500">
					<span>
						{card.fund?.lastFetchedAt ? `fetched ${card.fund.lastFetchedAt.toLocaleString()}` : ''}
					</span>
					{#if dev}
						<button
							type="button"
							aria-label={`refresh ${card.name}`}
							onclick={() => fetchOne(card.slug)}
							disabled={running || card.status === 'running' || card.status === 'enriching'}
							class="relative rounded-md px-2 py-0.5 font-semibold text-primary-700 transition duration-150 ease-in-out hover:bg-primary-300 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:text-gray-400"
						>
							refresh
						</button>
					{/if}
				</div>
				{#if card.fund?.lastError}
					<p class="mt-1 text-xs text-danger-500">{card.fund.lastError}</p>
				{/if}
			</div>
		{/each}
	</div>
</div>
