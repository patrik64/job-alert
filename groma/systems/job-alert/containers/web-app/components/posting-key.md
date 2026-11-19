---
type: C4 Component
title: Posting key
status: stable
groma:
  id: posting-key
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/posting.ts
      symbol: postingKey
  group: Shared rules
  technology: TypeScript
description: Normalizes a posting link into the key its description is stored under
---

Strips the tracking parameters boards add to a posting link, keeping the rest of its query, so that one posting listed by several funds shares one stored description. Plain TypeScript with no imports, so maintenance scripts can run it in Node directly.
