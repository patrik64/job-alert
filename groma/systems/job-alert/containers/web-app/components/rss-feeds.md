---
type: C4 Component
title: RSS feeds
status: stable
groma:
  id: rss-feeds
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/feeds.ts
    - scanner: typescript
      file: src/server/feed.ts
    - scanner: typescript
      file: src/server/rss.ts
    - scanner: typescript
      file: src/routes/rss-cpp.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-devops.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-go.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-kotlin.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-product-manager.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-react.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-rust.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-svelte.xml/+server.ts
      symbol: GET
    - scanner: typescript
      file: src/routes/rss-ux.xml/+server.ts
      symbol: GET
  group: Publishing
  technology: TypeScript, RSS 2.0
description: Topic feeds of each night's newcomers
---

Defines the nine topics (rust, svelte, c++, go, devops, kotlin, react, product manager, ux) and how a job matches each: by title and job function, and for the languages by stored description text. After the nightly run it renders every feed once over a thirty-day window into stored rows, which the /rss-*.xml routes serve as they are. The topic matchers are shared with search, the jobs API and statistics.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [src/server/feed.ts](../../../../../../src/server/feed.ts) | [src/shared/Job.ts](../../../../../../src/shared/Job.ts) | Reads newcomers | SQL via remult |
| [src/server/feeds.ts](../../../../../../src/server/feeds.ts) | [src/shared/FeedRender.ts](../../../../../../src/shared/FeedRender.ts) | Stores rendered feeds | remult repository |
| [src/server/rss.ts](../../../../../../src/server/rss.ts) | [src/shared/funds.ts](../../../../../../src/shared/funds.ts) | Names funds | Module import |
| [src/server/rss.ts](../../../../../../src/server/rss.ts) | [src/shared/site.ts](../../../../../../src/shared/site.ts) | Links the site | Module import |
