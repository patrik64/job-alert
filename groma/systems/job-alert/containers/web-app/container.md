---
type: C4 Container
title: Web application
status: stable
groma:
  id: web-app
  parent: job-alert
  technology: SvelteKit 2, Svelte 5, remult, Tailwind CSS 4 on Vercel (Node.js functions)
description: The site, its APIs, and the scraping engine behind them
---

One SvelteKit deployment serves the pages, the remult data API and backend methods, the RSS feeds, the statistics JSON and the public jobs API. The board scrapers run inside its server functions too: the refresh runner drives them by calling the fetch and enrichment backend methods over HTTP, one board at a time. All data lives in Supabase Postgres through a pg pool; without DATABASE_URL, remult falls back to JSON files for local work. The Svelte pages and components are not covered by the scanners and do not appear as components.
