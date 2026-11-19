---
type: C4 Component
title: Public jobs API
status: stable
groma:
  id: public-jobs-api
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/jobs-api.ts
    - scanner: typescript
      file: src/routes/api/v1/jobs/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint, SQL, JSON or Markdown
description: 'GET /api/v1/jobs: recent jobs filtered as a job seeker asks'
---

Answers which jobs appeared in a recent window, narrowed by title words, company, fund, topic, remote, region and salary, with one entry per posting however many funds list it. Validates every parameter, pages the answer, and returns JSON or a markdown list of links; the CDN caches each distinct query for an hour.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/server/api.ts](../../../../../../src/server/api.ts) | Queries the database | remult SQL context |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/server/feeds.ts](../../../../../../src/server/feeds.ts) | Matches topics | Function call |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/server/regions.ts](../../../../../../src/server/regions.ts) | Filters regions | Function call |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/lib/salary.ts](../../../../../../src/lib/salary.ts) | Formats pay | Function call |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Names funds | Module import |
| [src/server/jobs-api.ts](../../../../../../src/server/jobs-api.ts) | [src/shared/site.ts](../../../../../../src/shared/site.ts) | Links the site | Module import |
