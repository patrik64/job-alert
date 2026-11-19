---
type: Groma Flow
title: Nightly board refresh
groma:
  id: nightly-board-refresh
---

Each night GitHub Actions runs the refresh runner, which drives the web app one board at a time over its backend methods. A Getro-hosted board serves as the example; Consider and the other readers follow the same path. Newcomers that a language feed may need get their descriptions in enrichment passes, and the night ends with the feeds rendered and the statistics counted.

## Steps

| From | To | Action |
| --- | --- | --- |
| [GitHub Actions](../externals/github-actions.md) | [Refresh runner](../systems/job-alert/containers/nightly-refresh/components/refresh-runner.md) | Start the nightly run |
| [Refresh runner](../systems/job-alert/containers/nightly-refresh/components/refresh-runner.md) | [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | Call fetchFund for one board |
| [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | Run the backend method |
| [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | [Board scrapers](../systems/job-alert/containers/web-app/components/board-scrapers.md) | Find the board's scraper and list it |
| [Board scrapers](../systems/job-alert/containers/web-app/components/board-scrapers.md) | [Getro reader](../systems/job-alert/containers/web-app/components/getro-reader.md) | Read the Getro board configured for the fund |
| [Getro reader](../systems/job-alert/containers/web-app/components/getro-reader.md) | [Getro](../externals/getro.md) | Page through the board's jobs |
| [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | [Region classifier](../systems/job-alert/containers/web-app/components/region-classifier.md) | Drop jobs placed outside the US and Europe |
| [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | [Data model](../systems/job-alert/containers/web-app/components/data-model.md) | Insert newcomers and delete departed jobs |
| [Refresh runner](../systems/job-alert/containers/nightly-refresh/components/refresh-runner.md) | [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | Call enrichFund passes until none remain |
| [Getro reader](../systems/job-alert/containers/web-app/components/getro-reader.md) | [Applicant tracking system client](../systems/job-alert/containers/web-app/components/ats-client.md) | Fall back for a description the job page lacks |
| [Applicant tracking system client](../systems/job-alert/containers/web-app/components/ats-client.md) | [Applicant tracking systems](../externals/applicant-tracking-systems.md) | Fetch the posting |
| [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | [RSS feeds](../systems/job-alert/containers/web-app/components/rss-feeds.md) | Render the nine feeds once the night settles |
| [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | [Statistics](../systems/job-alert/containers/web-app/components/statistics.md) | Count the night into the ledger |
