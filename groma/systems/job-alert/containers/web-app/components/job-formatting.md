---
type: C4 Component
title: Job formatting
status: stable
groma:
  id: job-formatting
  parent: web-app
  code:
    - scanner: typescript
      file: src/lib/salary.ts
    - scanner: typescript
      file: src/lib/jobs.ts
      symbol: jobMeta
  group: Shared rules
  technology: TypeScript
description: Formats a job's function, place and pay for display
---

Turns a job's salary range into one readable line and joins it with the job function and location. The pages use it, and the jobs API sends the same salary line with each answer.
