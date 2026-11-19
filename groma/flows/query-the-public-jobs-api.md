---
type: Groma Flow
title: Query the public jobs API
groma:
  id: query-the-public-jobs-api
---

A job seeker or a script asks GET /api/v1/jobs for recent jobs. Topics become match patterns for the database query, locations are classified for the region and remote filters, and each answer entry carries a readable salary line.

## Steps

| From | To | Action |
| --- | --- | --- |
| [Job seeker](../actors/job-seeker.md) | [Public jobs API](../systems/job-alert/containers/web-app/components/public-jobs-api.md) | Request recent jobs with filters |
| [Public jobs API](../systems/job-alert/containers/web-app/components/public-jobs-api.md) | [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | Open a database context |
| [Public jobs API](../systems/job-alert/containers/web-app/components/public-jobs-api.md) | [RSS feeds](../systems/job-alert/containers/web-app/components/rss-feeds.md) | Turn topics into match patterns |
| [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | [Supabase Postgres](../externals/supabase-postgres.md) | Run the window's queries |
| [Public jobs API](../systems/job-alert/containers/web-app/components/public-jobs-api.md) | [Region classifier](../systems/job-alert/containers/web-app/components/region-classifier.md) | Classify locations for the region and remote filters |
| [Public jobs API](../systems/job-alert/containers/web-app/components/public-jobs-api.md) | [Job formatting](../systems/job-alert/containers/web-app/components/job-formatting.md) | Write each salary line |
