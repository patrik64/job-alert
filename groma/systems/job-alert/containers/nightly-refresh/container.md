---
type: C4 Container
title: Refresh runner
status: stable
groma:
  id: nightly-refresh
  parent: job-alert
  technology: Node.js 24 script, no dependencies
description: Command-line driver of the nightly board refresh
---

Runs on GitHub Actions each night, or by hand against any deployment via BASE_URL. It asks the web app for the list of boards, then works two lanes side by side: one fetches each board in turn, the other runs enrichment passes until every newcomer has its description. It then tidies unreferenced descriptions, renders the RSS feeds and counts the night's statistics, and leaves what each fund gained in fetch-results.json.
