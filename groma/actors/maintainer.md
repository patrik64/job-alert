---
type: C4 Actor
title: Maintainer
description: Keeps the board scrapers working
status: stable
groma:
  id: maintainer
---

The developer who runs the project. They add a board by writing its scraper and catalogue entry, fix scrapers when a board changes shape, and run the refresh script by hand for chosen boards or against a local dev server, where the dashboard also offers refresh buttons.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [maintainer](maintainer.md) | [scripts/fetch-all.mjs](../../scripts/fetch-all.mjs) | Refreshes chosen boards | Node.js CLI |
| [maintainer](maintainer.md) | [src/server/api.ts](../../src/server/api.ts) | Refreshes boards locally | Dev dashboard buttons, remult backend methods |
| [maintainer](maintainer.md) | [src/routes/download/+server.ts](../../src/routes/download/%2Bserver.ts) | Exports listed jobs | HTTPS, development only |
