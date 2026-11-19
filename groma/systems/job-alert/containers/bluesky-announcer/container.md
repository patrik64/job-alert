---
type: C4 Container
title: Bluesky announcer
status: stable
groma:
  id: bluesky-announcer
  parent: job-alert
  technology: Node.js 24 scripts, run TypeScript directly
description: Command-line announcer of the night's new rust jobs
---

Runs after the refresh on the same GitHub Actions runner. It reads the rust jobs window from the web app, keeps the newcomers of funds that gained jobs in this run, places each by the app's own region classifier, and posts the European ones to Bluesky as a thread. Can compose without posting, cover every standing newcomer, or just check the credentials.
