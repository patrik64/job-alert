---
type: C4 Component
title: Rust announcement
status: stable
groma:
  id: rust-announcement
  parent: bluesky-announcer
  code:
    - scanner: javascript
      file: scripts/post-rust-jobs.mjs
  technology: Node.js
description: Picks the night's new rust jobs in Europe and composes the posts
---

Reads the rust jobs window from the web app, keeps newcomers of funds that gained something in this run according to fetch-results.json, counts a posting several funds list once, and composes the thread: each European job by company and title, then the totals and a link to the rust jobs page. A night without new rust jobs posts nothing.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [scripts/post-rust-jobs.mjs](../../../../../../scripts/post-rust-jobs.mjs) | [src/routes/api/[...remult]/+server.ts](../../../../../../src/routes/api/%5B...remult%5D/%2Bserver.ts) | Reads rust jobs | HTTPS POST /api/rustJobs |
| [scripts/post-rust-jobs.mjs](../../../../../../scripts/post-rust-jobs.mjs) | [src/server/regions.ts](../../../../../../src/server/regions.ts) | Places jobs in Europe | Direct TypeScript import |
| [scripts/post-rust-jobs.mjs](../../../../../../scripts/post-rust-jobs.mjs) | [scripts/bluesky.mjs](../../../../../../scripts/bluesky.mjs) | Posts the thread | ES module import |
| [scripts/post-rust-jobs.mjs](../../../../../../scripts/post-rust-jobs.mjs) | [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | Reads the night's gains | fetch-results.json file |
