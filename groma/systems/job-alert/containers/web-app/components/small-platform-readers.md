---
type: C4 Component
title: Small platform readers
status: stable
groma:
  id: small-platform-readers
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/scrapers/niceboard.ts
      symbol: niceboardBoard
    - scanner: typescript
      file: src/server/scrapers/welcomekit.ts
      symbol: welcomekitBoard
    - scanner: typescript
      file: src/server/scrapers/wttj.ts
      symbol: wttjBoard
  group: Board scraping
  technology: TypeScript
description: Readers for Niceboard and Welcome to the Jungle boards
---

Shared readers for the smaller hosted platforms a few funds use: Niceboard boards, and Welcome to the Jungle with its Welcome Kit career sites.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/scrapers/niceboard.ts](../../../../../../src/server/scrapers/niceboard.ts) | [other-job-boards](../../../../../externals/other-job-boards.md) | Lists board jobs | HTTPS |
| [src/server/scrapers/niceboard.ts](../../../../../../src/server/scrapers/niceboard.ts) | [src/server/scrapers/http.ts](../../../../../../src/server/scrapers/http.ts) | Fetches pages | Function call |
