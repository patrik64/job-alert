---
type: C4 Component
title: Region classifier
status: stable
groma:
  id: region-classifier
  parent: web-app
  code:
    - scanner: typescript
      file: src/server/regions.ts
  group: Shared rules
  technology: TypeScript
description: Reads regions and remote status from free-text locations
---

Recognizes countries, regions, cities, abbreviations and world areas in board location lines. It decides which jobs are within reach at import, answers the jobs API's region and remote filters, buckets the statistics by area, and tells the Bluesky announcer which rust jobs are in Europe.
