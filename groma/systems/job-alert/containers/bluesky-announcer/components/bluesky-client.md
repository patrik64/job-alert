---
type: C4 Component
title: Bluesky client
status: stable
groma:
  id: bluesky-client
  parent: bluesky-announcer
  code:
    - scanner: javascript
      file: scripts/bluesky.mjs
  technology: AT Protocol XRPC
description: Posts rich-text threads to Bluesky
---

Logs in with an app password from the environment, splits a list of linked lines into posts within Bluesky's 300-grapheme limit, and publishes them as a reply thread. On a dry run, or without the password, it prints the thread and posts nothing.

## Relationships

| Source | Target | Description | Technology |
| --- | --- | --- | --- |
| [scripts/bluesky.mjs](../../../../../../scripts/bluesky.mjs) | [bluesky](../../../../../externals/bluesky.md) | Publishes posts | AT Protocol XRPC over HTTPS |
