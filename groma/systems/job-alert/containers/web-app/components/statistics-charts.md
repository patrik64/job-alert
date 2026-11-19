---
type: C4 Component
title: Statistics charts
status: stable
groma:
  id: statistics-charts
  parent: web-app
  code:
    - scanner: typescript
      file: src/lib/charts/configs.ts
    - scanner: typescript
      file: src/lib/charts/palette.ts
      symbol: PALETTE
  group: Publishing
  technology: Chart.js
description: Chart configurations and colours for the statistics page
---

Factories for the bar charts the statistics page draws in the browser, with the site's palette and shared conventions for axes, labels and tooltips.
