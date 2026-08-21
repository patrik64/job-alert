# job-alert

Up-to-date information about the jobs at the portfolio companies of venture
capital funds. Scrapes each fund's public job board, stores the jobs in Neon
(postgres), and highlights newcomers — jobs that appeared on a board since the
last fetch. Jobs that leave their board are marked closed.

Built with SvelteKit 2, Svelte 5, remult and Tailwind CSS 4; a close sibling
of [portfolio-alert](https://github.com/patrik64/portfolio-alert).

## Pages

- **dashboard** (`/`) — one card per fund with job count, newcomer badge and
  last-fetch time; the whole card links to the fund's page. In development a
  **fetch all** button runs every scraper, and each card has its own
  **refresh** button.
- **fund** (`/funds/[slug]`) — the fund's listed jobs grouped by company, with
  each job's function, location and pay where the board publishes them, a link
  to the job's page on the board and one to the posting itself; a search box
  narrows the list and a checkbox brings the closed jobs back in.
- **newcomers** (`/newcomers`) — jobs found by the latest fetch that were not
  in the database before, grouped by fund. The very first fetch of a fund is a
  baseline import and is not counted as newcomers. A **clean** button
  (development only) acknowledges the current newcomers.
- **search** (`/search`) — searches all listed jobs across every board by
  title, company, category, sector or location (server-side, debounced).
- **timeline** (`/timeline`) — the newcomers of the last two weeks grouped by
  the day they first appeared and then by fund, newest day first; **show
  earlier** widens the window. A fund's baseline import shows as a count.
- **download** (`/download`) — a JSON file with every listed job grouped by fund
  and company (no descriptions).
- **about** (`/about`) — what the app does and how the pages fit together.

Every job row shows when the job was first encountered ("first seen"). Job
descriptions are collected too, but not shown yet.

## Data

- `funds` — one row per tracked board: listed job count, newcomer count, last
  fetch, last error, and the day and size of its baseline import.
- `jobs` — one row per job ever seen, keyed `fund:board-job-id`: company,
  title, the job's page on the board, the posting's own url, category (job
  function), sector (the company's industry tags), location, salary range,
  posted date, and the newcomer / baseline / closed / enriched state.
- `job_details` — the job's description (html or markdown, as the board
  delivers it), kept apart so listing and diffing never drag descriptions
  along — and kept only for the jobs that appear after a board's baseline
  import (a baseline is thousands of jobs a board, more than a small database
  has room for; it is the newcomers that get read), dropped when a job closes.

Identity is the board's own job id, so refetches are idempotent.

## Setup

```sh
pnpm install
```

Put the Neon postgres connection string in `.env`:

```
DATABASE_URL=postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
```

Without `DATABASE_URL`, remult falls back to JSON files in `./db/` — handy for
local experiments. Tables are created automatically on first use.

```sh
pnpm dev             # start the dev server
pnpm check           # typecheck (svelte-check)
pnpm test-scrapers   # smoke-test every board scraper outside the app
pnpm test-scrapers gv khosla   # ...or just some of them
pnpm build           # production build
```

The first fetch of a board is best run locally (dashboard → **refresh**): the
Getro boards list ten thousand jobs each, and their descriptions are fetched
one page per job in bounded passes that take several minutes in total.

## Deployment

The app is meant for Vercel (`DATABASE_URL` as an environment variable on the
project). `vercel` for a preview deploy, `vercel --prod` for production.

## Nightly refresh

`scripts/fetch-all.mjs` refreshes every fund against the deployment by calling
the same endpoints the dashboard's buttons use — the listing, then enrichment
passes until every new job has its description — and leaves what each fund
gained in `fetch-results.json`. `scripts/post-newcomers.mjs` then announces the
finds on Bluesky, naming each job and linking it to its page on the board, as a
short thread or, on a busy night, as a count per fund.

```sh
pnpm fetch-all                       # refresh every fund against production
pnpm fetch-all --only=gv,khosla      # ...or just some of them
pnpm post-newcomers --dry-run        # compose the bluesky post, post nothing
pnpm post-newcomers                  # ...and publish it
pnpm post-newcomers --current        # ...covering the whole newcomers page
pnpm post-newcomers --check          # prove the app password still works
```

`BASE_URL` points both scripts at another deployment (e.g. a local dev
server). The Bluesky account and the GitHub workflow that runs the two scripts
every night are still to come; `BLUESKY_IDENTIFIER` and `BLUESKY_APP_PASSWORD`
are read from the environment when they are.

## Scrapers

`src/server/scrapers/index.ts` maps fund slugs (see `src/shared/funds.ts`) to
board scrapers. A scraper lists every job on its board and, if the board keeps
descriptions on pages of their own, knows how to fetch a job's detail:

- **Getro** boards (Khosla Ventures, Insight Partners, 2150, Accel) — `getro.ts`: the
  public search api, 20 jobs a page, paced to stay under its rate limit; the
  description and job functions come from each job page's next.js data.
- **Consider** boards (GV, 01 Advisors, Sequoia Capital) — `consider.ts`: the
  board's own search api behind a csrf handshake, up to a thousand jobs a page;
  no job pages, so a job links to its company's page on the board, and no
  descriptions of its own — those are read from the posting's applicant
  tracking system (`ats.ts`: Greenhouse, Ashby, Lever and Workday publish
  their postings through open apis; about two thirds of these boards' jobs
  sit on one of them). Getro boards fall back to the same source when a job
  page carries no description.
- **Greenhouse** boards (Flagship Pioneering) — `greenhouse.ts`: a fund's own
  greenhouse job board whose offices are the portfolio companies; one request
  lists everything, pay ranges included.
- **Y Combinator** — `ycombinator.ts`: the job search sits behind a login, so
  the board is read company by company — the jobs sitemap names the hiring
  companies, each company page embeds its current postings — and a job's own
  page is read for its description (markdown).

Scrapers fail loudly rather than import a partial list (which would mark the
missing jobs closed, only to have them reappear as newcomers later); a failing
fund shows its error on the dashboard card while the other fetches continue.
