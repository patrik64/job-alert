---
type: C4 Component
title: Data API
status: stable
groma:
  id: data-api
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/api.ts
      symbol: api
    - scanner: typescript
      file: src/hooks.server.ts
      symbol: handle
    - scanner: typescript
      file: src/routes/api/[...remult]/+server.ts
  group: Backend and data
  technology: remult over SvelteKit hooks, pg pool
description: Serves the entities and backend methods over HTTP
---

Mounts remult under /api: read access to funds, jobs and descriptions for the pages, and the backend methods that the pages and the scripts call as POST requests to /api/ followed by the method name. Owns the Postgres connection pool to Supabase's transaction pooler, and lets the CDN cache the nightly-changing entity reads for an hour.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/api.ts](../../../../../../src/server/api.ts) | [src/shared/Job.ts](../../../../../../src/shared/Job.ts) | Serves entity reads | remult entities |
| [src/server/api.ts](../../../../../../src/server/api.ts) | [supabase-postgres](../../../../../externals/supabase-postgres.md) | Stores all data | pg pool via Supabase transaction pooler |
| [src/server/api.ts](../../../../../../src/server/api.ts) | [src/shared/ScrapeController.ts](../../../../../../src/shared/ScrapeController.ts) | Exposes backend methods | remult controllers |
