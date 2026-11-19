---
type: C4 System
title: Supabase Postgres
description: The project's database, hosted by Supabase
status: stable
groma:
  id: supabase-postgres
  technology: PostgreSQL on Supabase free tier, transaction pooler
---

Holds the funds, every listed job, the descriptions of jobs a language feed may need, the rendered RSS feeds and the statistics ledger. The tables are defined by the web app's remult entities and created on first use. The free tier caps storage at 500 MB, which shapes the import filters and the slim queries.
