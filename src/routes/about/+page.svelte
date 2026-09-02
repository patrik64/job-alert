<script lang="ts">
	import { FUNDS } from '../../shared/funds';
	import { REPO_URL, RUST_BLUESKY_HANDLE, RUST_BLUESKY_URL, SITE_NAME } from '../../shared/site';
	import { ScrapeController } from '../../shared/ScrapeController';

	let jobCount = $state(0);

	$effect(() => {
		ScrapeController.countJobs().then((n) => (jobCount = n));
	});
</script>

<svelte:head>
	<title>about — {SITE_NAME}</title>
</svelte:head>

<div class="mx-auto mt-2 w-full max-w-[53rem] px-6 py-4 lg:dashed-frame">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-lg font-semibold text-white">about</h1>
		<span class="text-sm text-white/80">
			{FUNDS.length} funds
			{#if jobCount > 0}
				· {jobCount.toLocaleString()} jobs
			{/if}
		</span>
	</div>

	<div class="mt-4 flex flex-col gap-4 text-sm text-white">
		<p>
			Hi, my name is Patrik Simic -
			<a href="https://www.github.com/patrik64" class="font-semibold text-white underline"
				>github.com/patrik64</a
			>
			and I created this app to help me find new work.
		</p>
		<p>
			If you have some ideas/suggestions how to improve this app, feel free to send me an email
			(the email address is on my github page).
		</p>
		<p>
			<span class="font-semibold">{SITE_NAME}</span> watches the job boards of {FUNDS.length}
			venture capital funds — the openings at their portfolio companies. It reads each board's
			public listing, keeps every job it has ever seen, and highlights
			<a href="/newcomers" class="font-semibold text-white underline">newcomers</a> — jobs that
			appeared on a board since the last fetch. A job that leaves its board is marked closed and
			drops out of the listings.
		</p>
		<p>
			The <a href="/" class="font-semibold text-white underline">dashboard</a> shows one card per
			fund with its job count, newcomer badge and last-fetch time; each fund's page lists its jobs
			by company, with the job's function, location and pay where the board publishes them. The
			first fetch of a fund imports a baseline and is not counted as newcomers. Every job row
			shows when it was first encountered.
		</p>
		<p>
			<a href="/search" class="font-semibold text-white underline">search</a> finds jobs across every
			board by title, company, category, sector or location,
			<a href="/timeline" class="font-semibold text-white underline">timeline</a> groups them by the
			day they first appeared, and
			<a href="/rust-jobs" class="font-semibold text-white underline">rust jobs</a> picks out, in the
			same form, the listed jobs that name the language in their title or function — or in their
			description, where one is kept. Job descriptions are kept for the jobs that appear after a
			board's first import; a way to read them here is coming.
		</p>
		<p>
			Every night the boards are refreshed automatically; the newcomers of each night go out in the
			rss feeds:
		</p>
		<ul class="ml-5 flex list-disc flex-col gap-1">
			<li>
				<a href="/rss-rust.xml" target="_blank" class="font-semibold text-white underline"
					>rss-rust.xml</a
				> — rust jobs
			</li>
			<li>
				<a href="/rss-svelte.xml" target="_blank" class="font-semibold text-white underline"
					>rss-svelte.xml</a
				> — svelte jobs
			</li>
			<li>
				<a href="/rss-cpp.xml" target="_blank" class="font-semibold text-white underline"
					>rss-cpp.xml</a
				> — c++ jobs
			</li>
			<li>
				<a href="/rss-go.xml" target="_blank" class="font-semibold text-white underline"
					>rss-go.xml</a
				> — go jobs
			</li>
			<li>
				<a href="/rss-devops.xml" target="_blank" class="font-semibold text-white underline"
					>rss-devops.xml</a
				> — devops jobs
			</li>
			<li>
				<a href="/rss-kotlin.xml" target="_blank" class="font-semibold text-white underline"
					>rss-kotlin.xml</a
				> — kotlin jobs
			</li>
			<li>
				<a href="/rss-react.xml" target="_blank" class="font-semibold text-white underline"
					>rss-react.xml</a
				> — react jobs
			</li>
			<li>
				<a href="/rss-product-manager.xml" target="_blank" class="font-semibold text-white underline"
					>rss-product-manager.xml</a
				> — product manager jobs
			</li>
			<li>
				<a href="/rss-ux.xml" target="_blank" class="font-semibold text-white underline"
					>rss-ux.xml</a
				> — ux &amp; graphic design jobs
			</li>
		</ul>
		<p>
			The new rust jobs among them are announced on bluesky at
			<a
				href={RUST_BLUESKY_URL}
				target="_blank"
				rel="external noreferrer"
				class="font-semibold text-white underline">@{RUST_BLUESKY_HANDLE}</a
			>.
		</p>
		<p>
			Built with SvelteKit, Svelte 5, remult and Tailwind CSS on a Supabase postgres database. The
			source is on
			<a href={REPO_URL} target="_blank" rel="external noreferrer" class="font-semibold text-white underline"
				>github</a
			>.
		</p>
	</div>
</div>
