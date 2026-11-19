---
type: C4 Component
title: Fund catalogue
status: stable
groma:
  id: fund-catalogue
  parent: web-app
  code:
    - scanner: typescript
      file: src/shared/funds.ts
  group: Shared rules
  technology: TypeScript
description: 'The tracked funds: slug, name and board address'
---

The one list of funds the app follows. Slugs key the scrapers and every stored row; names and board links appear on the pages, in the feeds and in API answers.
