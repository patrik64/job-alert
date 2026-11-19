---
type: C4 Component
title: Consider reader
status: stable
groma:
  id: consider-reader
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/scrapers/consider.ts
      symbol: considerBoard
    - scanner: typescript
      file: src/server/scrapers/considernext.ts
  group: Board scraping
  technology: TypeScript
description: Lists boards hosted on Consider, old and new
---

Two readers for the two generations of Consider boards: the search API behind a session cookie and CSRF handshake, and the rebuilt Next.js boards paged through a server action whose id is mined from the app's scripts and renewed when it changes. Consider keeps no descriptions, so details come from the applicant tracking system client.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/scrapers/consider.ts](../../../../../../src/server/scrapers/consider.ts) | [consider](../../../../../externals/consider.md) | Lists board jobs | HTTPS, JSON API and server actions |
| [src/server/scrapers/consider.ts](../../../../../../src/server/scrapers/consider.ts) | [src/server/scrapers/ats.ts](../../../../../../src/server/scrapers/ats.ts) | Reads descriptions | Function call |
| [src/server/scrapers/consider.ts](../../../../../../src/server/scrapers/consider.ts) | [src/server/scrapers/http.ts](../../../../../../src/server/scrapers/http.ts) | Fetches with retries | Function call |
