---
type: C4 Actor
title: Job seeker
description: Looks for work at VC-backed companies
status: stable
groma:
  id: job-seeker
---

Someone looking for a job at a venture-backed company. They browse the site's boards, search, timeline, rust jobs and statistics pages, subscribe to the topic RSS feeds, query the public jobs API for recent postings, and follow the rust announcements on Bluesky.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [job-seeker](job-seeker.md) | [src/server/api.ts](../../src/server/api.ts) | Browses boards and jobs | Svelte pages, remult over HTTPS |
| [job-seeker](job-seeker.md) | [src/routes/rss-rust.xml/+server.ts](../../src/routes/rss-rust.xml/%2Bserver.ts) | Subscribes to feeds | RSS over HTTPS |
| [job-seeker](job-seeker.md) | [src/routes/api/v1/jobs/+server.ts](../../src/routes/api/v1/jobs/%2Bserver.ts) | Queries recent jobs | HTTPS, JSON or Markdown |
| [job-seeker](job-seeker.md) | [src/routes/statistics.json/+server.ts](../../src/routes/statistics.json/%2Bserver.ts) | Reads statistics | Statistics page, JSON over HTTPS |
| [job-seeker](job-seeker.md) | [bluesky](../externals/bluesky.md) | Follows rust announcements | Bluesky app |
