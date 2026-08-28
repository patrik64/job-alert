# job-alert

Up-to-date information about the jobs at the portfolio companies of venture
capital funds. Scrapes each fund's public job board, stores the jobs in
Supabase (postgres), and highlights newcomers — jobs that appeared on a board since the
last fetch. Jobs that leave their board are marked closed.

Built with SvelteKit 2, Svelte 5, remult and Tailwind CSS 4

## Try

live at https://job-alert-pax.vercel.app/

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
  Terms combine with uppercase `AND` and `OR` (`AND` binds tighter); a term
  in `"quotes"` must match a title, company or location exactly, or be a
  whole category/sector tag.
- **timeline** (`/timeline`) — the newcomers of the last two weeks grouped by
  the day they first appeared and then by fund, newest day first; **show
  earlier** widens the window. A checkbox brings the funds' baseline imports
  in, each showing as a count on its day.
- **rust jobs** (`/rust-jobs`) — the timeline's form over the listed jobs that
  have to do with rust: the language named in the title or job function, or
  mentioned in the description where one is stored (a word match — "Trust"
  does not count). All of them at once, no window; a checkbox brings the
  closed ones back in (by title or function only — a closed job has no
  description any more).
- **download** (`/download`) — a JSON file with every listed job grouped by fund
  and company (no descriptions). A dev-only convenience: in production the
  route 404s and neither the icon nor the menu item appears.
- **about** (`/about`) — what the app does and how the pages fit together.
- **rss** — the nightly newcomer digests as feeds: one item per night that
  found some, naming the jobs under their funds (the first few dozen per
  fund, counting the rest).
  - `/rss-rust.xml` — rust jobs
  - `/rss-svelte.xml` — svelte jobs
  - `/rss-cpp.xml` — c++ jobs
  - `/rss-devops.xml` — devops jobs
  - `/rss-kotlin.xml` — kotlin jobs
  - `/rss-react.xml` — react jobs
  - `/rss-product-manager.xml` — product manager jobs
  - `/rss.xml` — all new jobs

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

Put the Supabase postgres connection string (the transaction pooler) in
`.env`:

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
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
gained in `fetch-results.json`. A board just added to the code is picked up
too: its first fetch imports the baseline (the biggest boards are still best
imported locally first — see Setup). `scripts/post-rust-jobs.mjs` then announces the
night's new rust jobs on Bluesky from
[rust-job-alert.bsky.social](https://bsky.app/profile/rust-job-alert.bsky.social),
naming each job under its fund and linking it to its page on the board — as a
short thread or, on a busy night, as a count per fund — with the thread linking
the rust jobs page; a night without any stays quiet. The engine behind the
posts is `scripts/bluesky.mjs`.

```sh
pnpm fetch-all                       # refresh every fund against production
pnpm fetch-all --only=gv,khosla      # ...or just some of them
pnpm post-rust-jobs --dry-run        # compose the bluesky post, post nothing
pnpm post-rust-jobs                  # ...and publish it
pnpm post-rust-jobs --current        # ...covering every standing rust newcomer
pnpm post-rust-jobs --check          # prove the app password still works
```

`BASE_URL` points both scripts at another deployment (e.g. a local dev
server).

`.github/workflows/daily-fetch.yml` runs the two scripts every night at 4am
Central European time (GitHub's cron only speaks UTC, so both candidate hours
fire and a guard keeps whichever is 4am in Berlin); it can also be run by hand
from the Actions tab. The announcement signs as `rust-job-alert.bsky.social`
with the app password in the `BLUESKY_RUST_APP_PASSWORD` secret; without it
the step composes and posts nothing, and the refresh runs on its own.

The same digests are served as RSS feeds, straight from the database: one
item per night that found newcomers, with the jobs named under their funds
and linked to their pages on the boards. A night still being written is held
back until it has settled, so readers never cache a half-announced one.

- `/rss-rust.xml` — the rust jobs, matched as on the rust jobs page (title,
  function, or the stored description)
- `/rss-svelte.xml` — the svelte jobs: "svelte" or "sveltekit" in the title,
  the function, or the stored description, since the framework hardly ever
  makes a title
- `/rss-cpp.xml` — the c++ jobs: "c++" or "cpp" in the title or function
- `/rss-devops.xml` — the devops jobs: "devops" or "dev ops" in the title or
  the board's job function
- `/rss-kotlin.xml` — the kotlin jobs, matched like the svelte ones
- `/rss-react.xml` — the react jobs: in a description only as the
  framework's proper name, since react is also just a verb
- `/rss-product-manager.xml` — the product manager jobs: "product manager"
  or "product management" in the title, or a job function saying literally
  "product manager" (the boards' Product Management tag also hangs on
  marketing and production roles, so it does not count on its own)
- `/rss.xml` — all new jobs, unnarrowed

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

Jobs whose application link is a bare linkedin posting
(`…linkedin.com/jobs/view/…`) are skipped at import: getro's sourcing pads
boards with postings lifted off linkedin — spam and other companies' roles
under portfolio names — while genuine openings apply through the company's
own site or applicant tracking system.

Scrapers fail loudly rather than import a partial list (which would mark the
missing jobs closed, only to have them reappear as newcomers later); a failing
fund shows its error on the dashboard card while the other fetches continue.
