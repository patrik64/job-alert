---
type: Groma Flow
title: Announce rust jobs on Bluesky
groma:
  id: announce-rust-jobs-on-bluesky
---

After the refresh, the same workflow runs the announcer. It posts only the rust newcomers of funds that gained jobs in this run, and only those located in Europe; a night without any posts nothing.

## Steps

| From | To | Action |
| --- | --- | --- |
| [GitHub Actions](../externals/github-actions.md) | [Rust announcement](../systems/job-alert/containers/bluesky-announcer/components/rust-announcement.md) | Start after the refresh |
| [Rust announcement](../systems/job-alert/containers/bluesky-announcer/components/rust-announcement.md) | [Refresh runner](../systems/job-alert/containers/nightly-refresh/components/refresh-runner.md) | Read which funds gained jobs from fetch-results.json |
| [Rust announcement](../systems/job-alert/containers/bluesky-announcer/components/rust-announcement.md) | [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | Request the rust jobs window |
| [Data API](../systems/job-alert/containers/web-app/components/data-api.md) | [Scrape controller](../systems/job-alert/containers/web-app/components/scrape-controller.md) | Answer with rustJobs |
| [Rust announcement](../systems/job-alert/containers/bluesky-announcer/components/rust-announcement.md) | [Region classifier](../systems/job-alert/containers/web-app/components/region-classifier.md) | Keep the jobs located in Europe |
| [Rust announcement](../systems/job-alert/containers/bluesky-announcer/components/rust-announcement.md) | [Bluesky client](../systems/job-alert/containers/bluesky-announcer/components/bluesky-client.md) | Hand over the composed lines |
| [Bluesky client](../systems/job-alert/containers/bluesky-announcer/components/bluesky-client.md) | [Bluesky](../externals/bluesky.md) | Publish them as a thread |
