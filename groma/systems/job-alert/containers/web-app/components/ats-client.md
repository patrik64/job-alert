---
type: C4 Component
title: Applicant tracking system client
status: stable
groma:
  id: ats-client
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/scrapers/ats.ts
    - scanner: typescript
      file: src/server/scrapers/ashby.ts
    - scanner: typescript
      file: src/server/scrapers/greenhouse.ts
  group: Board scraping
  technology: TypeScript
description: Reads postings from applicant tracking systems' open APIs
---

Resolves a posting link on Greenhouse, Ashby, Lever, Workday, Kula and similar systems to its description, which is how boards without descriptions get them. Also lists whole portfolio boards that funds run as one Greenhouse board or one Ashby organization.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/scrapers/ats.ts](../../../../../../src/server/scrapers/ats.ts) | [applicant-tracking-systems](../../../../../externals/applicant-tracking-systems.md) | Reads postings | HTTPS, JSON APIs |
| [src/server/scrapers/ats.ts](../../../../../../src/server/scrapers/ats.ts) | [src/server/scrapers/http.ts](../../../../../../src/server/scrapers/http.ts) | Fetches with retries | Function call |
