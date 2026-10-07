<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Chart from '$lib/charts/Chart.svelte';
	import { dayColumnsConfig, monthColumnsConfig, rankedBarsConfig } from '$lib/charts/configs';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { TopicName } from '../../server/feeds';
	import type { MonthStatistics, Statistics } from '../../server/statistics';
	import { FUNDS } from '../../shared/funds';
	import { SITE_NAME } from '../../shared/site';

	// the feeds' topics as the page names them, each with its feed
	const FEED_TOPICS: { key: TopicName; title: string; href: string }[] = [
		{ key: 'rust', title: 'rust', href: '/rss-rust.xml' },
		{ key: 'go', title: 'go', href: '/rss-go.xml' },
		{ key: 'cpp', title: 'c++', href: '/rss-cpp.xml' },
		{ key: 'kotlin', title: 'kotlin', href: '/rss-kotlin.xml' },
		{ key: 'react', title: 'react', href: '/rss-react.xml' },
		{ key: 'svelte', title: 'svelte', href: '/rss-svelte.xml' },
		{ key: 'devops', title: 'devops', href: '/rss-devops.xml' },
		{ key: 'product-manager', title: 'product manager', href: '/rss-product-manager.xml' },
		{ key: 'ux', title: 'ux & graphic design', href: '/rss-ux.xml' }
	];

	// held as it arrived rather than made deeply reactive: the numbers are only
	// ever replaced whole, and chart.js cannot instrument an array svelte has
	// wrapped
	let stats = $state.raw<Statistics | null>(null);
	let failed = $state(false);

	// every month comes in the one answer, summed on the server once a night,
	// so stepping from month to month asks for nothing more
	$effect(() => {
		fetch('/statistics.json')
			.then((resp) => (resp.ok ? resp.json() : Promise.reject(new Error(String(resp.status)))))
			.then((body: Statistics) => (stats = body))
			.catch(() => (failed = true));
	});

	// the month the address names, or else the latest one with anything in it
	const current = $derived.by(() => {
		if (!stats) return undefined;
		const asked = page.url.searchParams.get('month');
		return (
			stats.months.find((m) => m.month === asked) ??
			stats.months.findLast((m) => m.jobs > 0) ??
			stats.months.at(-1)
		);
	});
	const at = $derived(stats && current ? stats.months.indexOf(current) : -1);

	// the month goes into the address, so a link to the page keeps it. the
	// picker changes it in place; a column of the chart at the foot of the page
	// also brings its month's numbers back into view
	function show(month: string, toTop = false) {
		const url = new URL(page.url);
		url.searchParams.set('month', month);
		goto(url, { replaceState: true, keepFocus: true, noScroll: !toTop });
	}

	// the months and days are the server's — those of the nightly run's
	// calendar — so they are written out as given, never moved into the
	// viewer's timezone
	const dateOf = (month: string, day = 1) =>
		new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00Z`);
	const format = (options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
	const MONTH_AND_YEAR = format({ month: 'long', year: 'numeric' });
	const MONTH = format({ month: 'short' });
	const WEEKDAY = format({ weekday: 'short' });
	const monthName = (month: string) => MONTH_AND_YEAR.format(dateOf(month));
	const dayName = (month: string, day: number) => `${day} ${MONTH.format(dateOf(month))}`;
	const dayTitle = (month: string, index: number) =>
		`${WEEKDAY.format(dateOf(month, index + 1))} ${dayName(month, index + 1)}`;
	const ordinal = (n: number) =>
		`${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

	const number = (n: number) => n.toLocaleString('en');
	const jobs = (n: number) => `${number(n)} ${n === 1 ? 'job' : 'jobs'}`;
	const share = (n: number, of: number) => {
		const percent = of > 0 ? (100 * n) / of : 0;
		return percent > 0 && percent < 1 ? 'under 1%' : `${Math.round(percent)}%`;
	};

	// the days of a month that could be counted, first and last: the ledger
	// began partway through its first month, and the latest is still running
	const span = (m: MonthStatistics) => ({
		from: m.days.findIndex((n) => n != null) + 1,
		to: m.days.findLastIndex((n) => n != null) + 1
	});
	const caveat = (m: MonthStatistics) => {
		const { from, to } = span(m);
		if (from > 1) return `counted from the ${ordinal(from)}`;
		if (to < m.days.length) return `so far, to the ${ordinal(to)}`;
		return '';
	};

	const counted = $derived(current ? current.days.filter((n) => n != null) : []);
	const busiest = $derived.by(() => {
		if (!current) return undefined;
		const most = Math.max(0, ...counted);
		return most > 0 ? { day: current.days.indexOf(most) + 1, count: most } : undefined;
	});
	const perDay = $derived.by(() => {
		if (!current || counted.length === 0) return '';
		const average = current.jobs / counted.length;
		return average >= 10 ? number(Math.round(average)) : average.toFixed(1);
	});
	// the latest reading of the boards' standing within the month
	const latestOf = (readings: (number | null)[]) => readings.findLast((n) => n != null) ?? undefined;
	const listedLatest = $derived(current ? latestOf(current.listed) : undefined);
	const boardsLatest = $derived(current ? latestOf(current.boards) : undefined);
	const inFeeds = $derived(
		current ? FEED_TOPICS.reduce((n, t) => n + current.topics[t.key].total, 0) : 0
	);
	// the day a topic's feed had the most to say
	const topicBusiest = (days: (number | null)[]) => {
		const most = Math.max(0, ...days.filter((n) => n != null));
		return most > 0 ? { day: days.indexOf(most) + 1, count: most } : undefined;
	};

	interface Row {
		label: string;
		count: number;
		href?: string;
	}
	const fundRows = $derived<Row[]>(
		current?.topFunds.map((f) => ({ label: f.label, count: f.count, href: `/funds/${f.slug}` })) ?? []
	);

	const monthColumns = $derived(
		stats?.months.map((m, i) => {
			const name = MONTH.format(dateOf(m.month));
			const note = caveat(m);
			return {
				// the year under the first month and under every january
				label: i === 0 || m.month.endsWith('-01') ? [name, m.month.slice(0, 4)] : name,
				title: note ? `${monthName(m.month)} — ${note}` : monthName(m.month),
				count: m.jobs
			};
		}) ?? []
	);
</script>

<svelte:head>
	<title>statistics — {SITE_NAME}</title>
</svelte:head>

<!-- a ranking as a card: the bars, and under them the same rows as a table -->
{#snippet ranking(
	title: string,
	note: string,
	rows: Row[],
	of: number,
	// what the shares are shares of
	whole: string,
	column: string,
	empty: string
)}
	<section class="rounded-lg bg-white px-4 py-3 shadow-lg">
		<h2 class="font-semibold text-gray-800">{title}</h2>
		<p class="text-xs text-gray-500">{note}</p>
		{#if rows.length === 0}
			<p class="mt-4 mb-2 text-sm text-gray-600">{empty}</p>
		{:else}
			<div class="mt-2">
				<Chart
					label={`bar chart, ${title}: ${rows.map((row) => `${row.label} ${row.count}`).join(', ')}`}
					height={rows.length * 30 + 12}
					config={() => rankedBarsConfig(rows, (row) => `${share(row.count, of)} of ${whole}`)}
				/>
			</div>
			<details class="mt-1">
				<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
				<table class="mt-2 w-full text-sm">
					<thead>
						<tr class="text-xs text-gray-500">
							<th class="pb-1 text-left font-normal">{column}</th>
							<th class="pb-1 text-right font-normal">jobs</th>
							<th class="pb-1 pl-3 text-right font-normal">share</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as row (row.label)}
							<tr class="border-t border-gray-200">
								<td class="py-1 pr-2 text-gray-800">
									{#if row.href}
										<a href={row.href} class="transition duration-150 hover:underline">{row.label}</a>
									{:else}
										{row.label}
									{/if}
								</td>
								<td class="py-1 text-right text-gray-800 tabular-nums">{number(row.count)}</td>
								<td class="py-1 pl-3 text-right text-gray-500 tabular-nums">{share(row.count, of)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{/if}
	</section>
{/snippet}

{#snippet tile(label: string, value: string, note: string)}
	<div class="rounded-lg bg-white px-4 py-3 shadow-lg">
		<div class="text-xs text-gray-500">{label}</div>
		<div class="mt-0.5 text-2xl font-semibold text-gray-900">{value}</div>
		<div class="text-xs text-gray-500">{note}</div>
	</div>
{/snippet}

<div class="mx-auto mt-2 w-full max-w-[71rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">statistics</h1>
		{#if stats && current}
			<!-- the one filter, above everything it scopes -->
			<div class="flex items-center gap-1.5">
				<button
					type="button"
					aria-label="previous month"
					disabled={at <= 0}
					onclick={() => stats && show(stats.months[at - 1].month)}
					class="h-8 w-8 rounded-md border border-gray-300 bg-white text-gray-800 transition duration-150 hover:bg-gray-200 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-white disabled:text-gray-400"
				>
					‹
				</button>
				<select
					aria-label="month"
					value={current.month}
					onchange={(e) => show(e.currentTarget.value)}
					class="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:shadow-outline-green focus:outline-none"
				>
					{#each stats.months.toReversed() as m (m.month)}
						<option value={m.month}>{monthName(m.month)}</option>
					{/each}
				</select>
				<button
					type="button"
					aria-label="next month"
					disabled={at >= stats.months.length - 1}
					onclick={() => stats && show(stats.months[at + 1].month)}
					class="h-8 w-8 rounded-md border border-gray-300 bg-white text-gray-800 transition duration-150 hover:bg-gray-200 focus:shadow-outline-green focus:outline-none disabled:cursor-default disabled:bg-white disabled:text-gray-400"
				>
					›
				</button>
			</div>
		{/if}
	</div>

	{#if failed}
		<p class="mt-6 text-sm text-white/80">the statistics could not be loaded — try again in a moment</p>
	{:else if !stats}
		<Spinner label="loading statistics" />
	{:else if !current}
		<p class="mt-6 text-sm text-white/80">
			nothing counted yet — the statistics are counted by the nightly run, once the boards are
			refreshed
		</p>
	{:else}
		{@const { from, to } = span(current)}
		<p class="mt-1 text-sm text-white/80">
			the new jobs of {monthName(current.month)}{#if from > 1}, counted from the {ordinal(from)}, the
				day the ledger begins{:else if to < current.days.length}, so far — to the
				{ordinal(to)}{/if}{#if current.reconstructed > 0}; {current.reconstructed === 1
					? 'one of its days was'
					: `${current.reconstructed} of its days were`} counted after the fact, from the jobs still
				listed then{/if}
		</p>

		<div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
			{@render tile('new jobs', number(current.jobs), perDay ? `${perDay} a day on average` : 'none yet')}
			{@render tile('funds adding', number(current.funds), `of the ${number(FUNDS.length)} tracked`)}
			{@render tile(
				'busiest day',
				busiest ? dayName(current.month, busiest.day) : '—',
				busiest ? jobs(busiest.count) : 'none yet'
			)}
			{@render tile(
				'postings',
				number(current.postings),
				`${number(current.jobs - current.postings)} listings repeat one at another fund`
			)}
			{@render tile(
				'remote',
				share(current.remote, current.jobs),
				`${number(current.remote)} listings say so in their location`
			)}
			{@render tile(
				'with pay',
				share(current.salaried, current.jobs),
				`${number(current.salaried)} listings publish a salary`
			)}
			{@render tile(
				'in the feeds',
				number(inFeeds),
				'listings the rss feeds took up — one in two feeds counts in each'
			)}
			{@render tile(
				'on the boards',
				listedLatest != null ? number(listedLatest) : '—',
				boardsLatest != null
					? `jobs listed across ${number(boardsLatest)} boards, at the last reading`
					: 'the boards were not read in this month'
			)}
		</div>

		{#if current.jobs === 0}
			<p class="mt-6 text-sm text-white/80">no newcomers in {monthName(current.month)} yet</p>
		{:else}
			<div class="mt-4 grid gap-4 lg:grid-cols-2">
				{@render ranking(
					'most active funds',
					`the boards that listed the most new jobs, of the ${number(current.funds)} that listed any`,
					fundRows,
					current.jobs,
					"the month's listings",
					'fund',
					''
				)}
				{@render ranking(
					'companies hiring most',
					'the companies with the most new listings across every board — counted from the hundred busiest of each day',
					current.topCompanies,
					current.jobs,
					"the month's listings",
					'company',
					'no company yet'
				)}
			</div>

			<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
				<h2 class="font-semibold text-gray-800">new jobs by day</h2>
				<p class="text-xs text-gray-500">
					each day's finds, by the night the fetch turned them up{#if from > 1}; shaded, the days
						before the ledger began on the {ordinal(from)}{:else if to < current.days.length}; shaded,
						the days still to come{/if}
				</p>
				<div class="mt-2">
					<Chart
						label={`column chart of the new jobs on each day of ${monthName(current.month)}`}
						height={220}
						config={() => dayColumnsConfig(current.days, (i) => dayTitle(current.month, i))}
					/>
				</div>
				<details class="mt-1">
					<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
					<table class="mt-2 w-full max-w-md text-sm">
						<thead>
							<tr class="text-xs text-gray-500">
								<th class="pb-1 text-left font-normal">day</th>
								<th class="pb-1 text-right font-normal">new jobs</th>
								<th class="pb-1 pl-3 text-right font-normal">on the boards</th>
							</tr>
						</thead>
						<tbody>
							{#each current.days as n, i (i)}
								{#if n != null}
									<tr class="border-t border-gray-200">
										<td class="py-1 pr-2 text-gray-800">{dayTitle(current.month, i)}</td>
										<td class="py-1 text-right text-gray-800 tabular-nums">{number(n)}</td>
										<td class="py-1 pl-3 text-right text-gray-500 tabular-nums">
											{current.listed[i] != null ? number(current.listed[i]) : '—'}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
				<h2 class="font-semibold text-gray-800">the feeds</h2>
				<p class="text-xs text-gray-500">
					each rss feed's new jobs in {monthName(current.month)}, day by day — counted as the feed
					counts them: by the title, the job function or, for the languages, the stored description
				</p>
				<div class="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each FEED_TOPICS as topic (topic.key)}
						{@const t = current.topics[topic.key]}
						<div>
							<div class="flex items-baseline justify-between gap-2">
								<a
									href={topic.href}
									target="_blank"
									class="text-sm font-semibold text-gray-800 transition duration-150 hover:underline"
								>
									{topic.title}
								</a>
								<span class="text-sm text-gray-600 tabular-nums">{jobs(t.total)}</span>
							</div>
							<div class="mt-1">
								<Chart
									label={`column chart of the new ${topic.title} jobs on each day of ${monthName(current.month)}`}
									height={90}
									config={() =>
										dayColumnsConfig(t.days, (i) => dayTitle(current.month, i), { compact: true })}
								/>
							</div>
						</div>
					{/each}
				</div>
				<details class="mt-2">
					<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
					<table class="mt-2 w-full max-w-lg text-sm">
						<thead>
							<tr class="text-xs text-gray-500">
								<th class="pb-1 text-left font-normal">feed</th>
								<th class="pb-1 text-right font-normal">new jobs</th>
								<th class="pb-1 pl-3 text-right font-normal">share</th>
								<th class="pb-1 pl-3 text-right font-normal">busiest day</th>
							</tr>
						</thead>
						<tbody>
							{#each FEED_TOPICS as topic (topic.key)}
								{@const t = current.topics[topic.key]}
								{@const most = topicBusiest(t.days)}
								<tr class="border-t border-gray-200">
									<td class="py-1 pr-2 text-gray-800">
										<a href={topic.href} target="_blank" class="transition duration-150 hover:underline">
											{topic.title}
										</a>
									</td>
									<td class="py-1 text-right text-gray-800 tabular-nums">{number(t.total)}</td>
									<td class="py-1 pl-3 text-right text-gray-500 tabular-nums">{share(t.total, current.jobs)}</td>
									<td class="py-1 pl-3 text-right text-gray-500 tabular-nums">
										{most ? `${dayName(current.month, most.day)} (${number(most.count)})` : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</details>
			</section>

			<div class="mt-4 grid gap-4 lg:grid-cols-2">
				{@render ranking(
					'job functions',
					"the functions the boards file the jobs under — a job filed under two counts in each; a board's parent groupings are left out",
					current.topFunctions,
					current.jobs,
					"the month's listings",
					'function',
					'no board named a function this month'
				)}
				{@render ranking(
					'where the jobs are',
					`by the places their locations name — a location naming several counts in each; ${number(current.unplaced)} name no place (remote, hybrid, or an office's name)`,
					current.regions,
					current.jobs,
					"the month's listings",
					'area',
					'no location named a place this month'
				)}
			</div>
		{/if}

		<section class="mt-4 rounded-lg bg-white px-4 py-3 shadow-lg">
			<h2 class="font-semibold text-gray-800">month by month</h2>
			<p class="text-xs text-gray-500">
				new jobs in each month since the ledger began — a column opens its month
			</p>
			<!-- few months make for few columns, so the chart is only as wide as
			     they need until there are enough to fill the card -->
			<div class="mt-2" style="max-width: {Math.max(240, stats.months.length * 72)}px">
				<Chart
					label={`column chart of the new jobs in each month: ${stats.months.map((m) => `${monthName(m.month)} ${m.jobs}`).join(', ')}`}
					height={190}
					config={() => monthColumnsConfig(monthColumns, at, (i) => stats && show(stats.months[i].month, true))}
				/>
			</div>
			<details class="mt-1">
				<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">table view</summary>
				<table class="mt-2 w-full max-w-lg text-sm">
					<thead>
						<tr class="text-xs text-gray-500">
							<th class="pb-1 text-left font-normal">month</th>
							<th class="pb-1 text-right font-normal">new jobs</th>
							<th class="pb-1 pl-3 text-right font-normal">postings</th>
							<th class="pb-1 pl-3 text-right font-normal">funds adding</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.months.toReversed() as m (m.month)}
							{@const note = caveat(m)}
							<tr class="border-t border-gray-200">
								<td class="py-1 pr-2 text-gray-800">
									<a
										href={`?month=${m.month}`}
										class="transition duration-150 hover:underline"
										aria-current={m === current ? 'true' : undefined}>{monthName(m.month)}</a
									>
									{#if note}<span class="text-xs text-gray-500">({note})</span>{/if}
								</td>
								<td class="py-1 text-right text-gray-800 tabular-nums">{number(m.jobs)}</td>
								<td class="py-1 pl-3 text-right text-gray-800 tabular-nums">{number(m.postings)}</td>
								<td class="py-1 pl-3 text-right text-gray-800 tabular-nums">{number(m.funds)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
			<details class="mt-1">
				<summary class="cursor-pointer text-xs text-gray-500 select-none hover:underline">
					the feeds month by month
				</summary>
				<div class="overflow-x-auto">
					<table class="mt-2 w-full text-sm">
						<thead>
							<tr class="text-xs text-gray-500">
								<th class="pb-1 text-left font-normal">month</th>
								{#each FEED_TOPICS as topic (topic.key)}
									<th class="pb-1 pl-3 text-right font-normal whitespace-nowrap">{topic.title}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each stats.months.toReversed() as m (m.month)}
								<tr class="border-t border-gray-200">
									<td class="py-1 pr-2 whitespace-nowrap text-gray-800">
										<a
											href={`?month=${m.month}`}
											class="transition duration-150 hover:underline"
											aria-current={m === current ? 'true' : undefined}>{monthName(m.month)}</a
										>
									</td>
									{#each FEED_TOPICS as topic (topic.key)}
										<td class="py-1 pl-3 text-right text-gray-800 tabular-nums">
											{number(m.topics[topic.key].total)}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</details>
		</section>
	{/if}
</div>
