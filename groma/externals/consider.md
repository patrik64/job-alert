---
type: C4 System
title: Consider
description: Hosted job-board platform used by about seventy-five funds
status: stable
groma:
  id: consider
  technology: HTTPS, JSON search API behind a CSRF handshake; Next.js server actions
---

Consider hosts portfolio job boards on the funds' own domains or under consider.com. Older boards answer a search API behind a session cookie and CSRF token; boards rebuilt as Next.js apps page their jobs through a server action. Boards carry no descriptions, so those come from the postings' applicant tracking systems.
