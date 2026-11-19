---
type: C4 Component
title: Job search
status: stable
groma:
  id: job-search
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/search.ts
      symbol: searchJobs
  group: Publishing
  technology: Postgres full-text word index
description: Searches every listed job
---

Parses AND and OR terms, quoted exact matches and topic words, and runs them through a word index over title, company, job function, industry and location; topic words also match stored descriptions. Called through the scrape controller's search method.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/search.ts](../../../../../../src/server/search.ts) | [src/server/feeds.ts](../../../../../../src/server/feeds.ts) | Matches topics | Function call |
| [src/server/search.ts](../../../../../../src/server/search.ts) | [src/shared/Job.ts](../../../../../../src/shared/Job.ts) | Queries jobs | SQL via remult |
