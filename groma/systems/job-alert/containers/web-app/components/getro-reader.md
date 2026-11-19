---
type: C4 Component
title: Getro reader
status: stable
groma:
  id: getro-reader
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/scrapers/getro.ts
  group: Board scraping
  technology: TypeScript
description: Lists and details boards hosted on Getro
---

Pages through Getro's search API, paced across all boards to stay under its rate limit, and refuses a list that comes up more than five percent short. A job's description and functions come from its page's Next.js data, falling back to the posting's applicant tracking system. Also reads networks that retired Getro's front end but still answer its API.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/scrapers/getro.ts](../../../../../../src/server/scrapers/getro.ts) | [getro](../../../../../externals/getro.md) | Lists board jobs | HTTPS, JSON API and Next.js data |
| [src/server/scrapers/getro.ts](../../../../../../src/server/scrapers/getro.ts) | [src/server/scrapers/ats.ts](../../../../../../src/server/scrapers/ats.ts) | Falls back for descriptions | Function call |
| [src/server/scrapers/getro.ts](../../../../../../src/server/scrapers/getro.ts) | [src/server/scrapers/http.ts](../../../../../../src/server/scrapers/http.ts) | Fetches with pacing | Function call |
