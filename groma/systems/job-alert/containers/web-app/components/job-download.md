---
type: C4 Component
title: Job download
status: stable
groma:
  id: job-download
  parent: web-app
  code:
    - scanner: typescript
      file: src/routes/download/+server.ts
      symbol: GET
  group: Publishing
  technology: SvelteKit endpoint
description: Development-only JSON export of every listed job
---

Returns every listed job grouped by fund and company, without descriptions. Answers 404 in production.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/routes/download/+server.ts](../../../../../../src/routes/download/%2Bserver.ts) | [src/shared/Job.ts](../../../../../../src/shared/Job.ts) | Reads listed jobs | remult repository |
