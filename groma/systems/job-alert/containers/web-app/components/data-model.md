---
type: C4 Component
title: Data model
status: stable
groma:
  id: data-model
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/Job.ts
    - scanner: typescript
      file: src/shared/Fund.ts
      symbol: Fund
    - scanner: typescript
      file: src/shared/JobDetail.ts
      symbol: JobDetail
    - scanner: typescript
      file: src/shared/FeedRender.ts
      symbol: FeedRender
    - scanner: typescript
      file: src/shared/StatisticsRow.ts
      symbol: StatisticsRow
  group: Backend and data
  technology: remult entities
description: The stored tables and what the API may read of them
---

Entity classes for funds, jobs, job descriptions, rendered feeds and the statistics ledger. A job's id is its fund slug and the board's own job id, so refetches are idempotent; descriptions sit in their own table, one per posting, so listing and diffing never carry them. Writes happen only in backend code.
