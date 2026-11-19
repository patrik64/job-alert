---
type: C4 System
title: job alert
status: stable
groma:
  id: job-alert
description: Tracks VC portfolio job boards and surfaces each night's new jobs
---

A nightly run lists every tracked fund's job board, keeps the jobs located in the US or Europe, and diffs them against the database: jobs new to a board become newcomers, jobs gone from it are deleted. Descriptions are fetched for newcomers a language feed might need. The same night renders the RSS feeds and counts the statistics ledger, and the rust newcomers are announced on Bluesky. A board's first fetch is a silent baseline import.
