---
type: C4 Component
title: Scraper HTTP
status: stable
groma:
  id: scraper-http
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/scrapers/http.ts
  group: Board scraping
  technology: TypeScript, fetch
description: Polite HTTP for every scraper
---

Fetch with retries on throttling and server errors, request pacing, bounded concurrency over many pages, JSON fetching, and the normalizing of salary periods that the readers share.
