---
type: C4 Component
title: Statistics
status: stable
groma:
  id: statistics
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/statistics.ts
    - scanner: typescript
      file: src/routes/statistics.json/+server.ts
      symbol: GET
  group: Publishing
  technology: TypeScript, JSON
description: Nightly ledger of newcomer counts and its monthly summary
---

Each night counts the newcomers by fund, company, job function, topic and area into one ledger row a day, then sums the months into a summary row that /statistics.json serves. The ledger keeps counts as they stood, since jobs leave the database with their boards.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | [src/shared/StatisticsRow.ts](../../../../../../src/shared/StatisticsRow.ts) | Keeps the ledger | remult repository |
| [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | [src/server/regions.ts](../../../../../../src/server/regions.ts) | Counts by area | Function call |
| [src/server/statistics.ts](../../../../../../src/server/statistics.ts) | [src/server/feeds.ts](../../../../../../src/server/feeds.ts) | Counts topics | Function call |
