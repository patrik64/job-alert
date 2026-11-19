---
type: C4 System
title: GitHub Actions
description: Runs the nightly refresh and announcement
status: stable
groma:
  id: github-actions
  technology: Scheduled workflow (daily-fetch.yml)
---

The daily-fetch workflow fires once a night at 22:43 UTC, or by hand, on a bare Ubuntu runner with Node 24. It runs the refresh script and then the Bluesky announcement, the latter even when some boards failed.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [github-actions](github-actions.md) | [scripts/fetch-all.mjs](../../scripts/fetch-all.mjs) | Starts the nightly refresh | daily-fetch workflow |
| [github-actions](github-actions.md) | [scripts/post-rust-jobs.mjs](../../scripts/post-rust-jobs.mjs) | Starts the announcement | daily-fetch workflow |
