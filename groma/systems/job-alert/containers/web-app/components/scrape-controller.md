---
type: C4 Component
title: Scrape controller
status: stable
groma:
  id: scrape-controller
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/ScrapeController.ts
  group: Backend and data
  technology: remult backend methods, raw SQL
description: Refreshes boards and answers the app's heavier queries
---

fetchFund lists one board through its scraper, drops LinkedIn-only postings, blocked companies and jobs outside the US and Europe, then inserts newcomers and deletes departed jobs in bulk SQL; a board's first fetch is a baseline. enrichFund reads descriptions for newcomers within a time budget, keeping only those a language feed may need. It also hosts the nightly tidy, feed render and statistics count, plus the search, rust jobs and count queries the pages use.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/scrapers/index.ts](../../../../../../src/server/scrapers/index.ts) | Runs board scrapers | Dynamic import |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/regions.ts](../../../../../../src/server/regions.ts) | Filters by location | Dynamic import |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/shared/posting.ts](../../../../../../src/shared/posting.ts) | Keys descriptions | Function call |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Lists tracked funds | Module import |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/shared/Job.ts](../../../../../../src/shared/Job.ts) | Writes jobs and descriptions | remult repositories, bulk SQL |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/feeds.ts](../../../../../../src/server/feeds.ts) | Renders feeds | Dynamic import |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | Counts the night | Dynamic import |
| [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | [src/server/search.ts](../../../../../../src/server/search.ts) | Searches jobs | Dynamic import |
