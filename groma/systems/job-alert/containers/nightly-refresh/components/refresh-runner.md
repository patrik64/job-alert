---
type: C4 Component
title: Refresh runner
status: stable
groma:
  id: refresh-runner
  parent: nightly-refresh
  code:
    - scanner: javascript
      file: scripts/fetch-all.mjs
  technology: Node.js
description: Drives the refresh of every board through the web app
---

Calls the web app's backend methods over HTTP: listBoards, then fetchFund per board and enrichFund passes until no descriptions remain, then tidyDetails, renderFeeds and renderStatistics. Retries failed enrichment passes, reports per-board outcomes, and writes fetch-results.json for the announcer. --only narrows the run to chosen boards.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [scripts/fetch-all.mjs](../../../../../../scripts/fetch-all.mjs) | [src/routes/api/[...remult]/+server.ts](../../../../../../src/routes/api/%5B...remult%5D/%2Bserver.ts) | Calls backend methods | HTTPS POST to /api/ backend methods |
