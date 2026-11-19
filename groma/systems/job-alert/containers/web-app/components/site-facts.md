---
type: C4 Component
title: Site facts
status: stable
groma:
  id: site-facts
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/site.ts
  group: Shared rules
  technology: TypeScript
description: Shared constants about this deployment
---

The site's name, live URL, repository URL and Bluesky handle, used by pages, feeds and the jobs API.
