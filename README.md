# No-Clickbait News Aggregator

Fully-automated Croatian news aggregator/summarizer. It pulls articles from
Croatian news portals (plus a little major EU/world news), rewrites each into a
short, factual, old-school-reporting-style summary via a two-step
extract-facts → write-summary pipeline, and publishes a static page. No manual
curation, no editorial approval step. See [`CLAUDE.md`](./CLAUDE.md) for the
full product spec and principles.

## Stack

- **Node.js (ESM)**, no build step.
- **SQLite** via `better-sqlite3` — single inspectable file in `data/`.
- **RSS** via `rss-parser`; **full-text extraction** via `@mozilla/readability` + `jsdom`.
- **Summarization** via Google Gemini (`@google/genai`, free tier) or Anthropic
  Claude (`@anthropic-ai/sdk`, paid) — two calls per article, and **stubbed by
  default so the whole pipeline runs with no API key**.
- **Static site**: `public/index.html` regenerated every ingestion cycle. A
  dependency-free preview server serves it locally.
- **Scheduling** via `node-cron`.

## Quick start

```bash
npm install                 # note: better-sqlite3 compiles a native binary
cp .env.example .env        # defaults work as-is (stub LLM mode, no key needed)

npm run migrate             # create data/news.db and seed sources
npm run ingest              # one full cycle: fetch -> filter -> extract -> summarize (stub) -> publish
npm run serve               # preview the generated site at http://localhost:4173
```

`npm test` runs the unit tests (filter + dedupe logic; no network or LLM).

## How it runs (the pipeline)

One ingestion cycle (`npm run ingest`, or hourly at the top of the hour under
`npm start` — see `INGEST_INTERVAL_MIN`) does, per active source:

1. **Fetch** the RSS feed, insert new items into `raw_items` (deduped by URL, so
   nothing already fetched is fetched or processed twice).
2. **Filter** out-of-scope junk (horoscopes, galleries, video-only, sponsored,
   sports live-tickers, …) by pattern, then drop anything older than
   `FETCH_MAX_AGE_HOURS` by the source's own pubDate; dropped items keep a
   `filter_reason`. The default (3h) keeps each run cheap (only recent items
   reach the full-text + LLM steps) while absorbing the deployed cron's
   real-world unreliability — GitHub scheduled runs get delayed/skipped, so a
   tighter window would turn every missed hour into a permanent coverage gap.
3. **Extract full text** of each surviving article (readability), plus its
   real publish timestamp from the page's own metadata. The source's own
   photo is never used; illustrative images are added later (step 5b).
4. **Extract facts** (LLM call 1): structured who/what/when/where/why JSON,
   from the body only — deliberately discarding the original wording. Also
   classifies `is_current_news` (drops historical retrospectives, gossip,
   lifestyle content that slips past the URL filter), the article's own
   **display category** (`hrvatska`/`zagreb`/`svijet`/`sport`, from its actual
   content — not just which portal or feed it came from), and, for
   world-track items, a 0–10 importance score dropped below
   `WORLD_SCORE_THRESHOLD`.
4b. **Duplicate check**: with ~11 Croatian portals active, the same event often
   gets reported by several of them within the same hour, worded differently.
   Before writing a summary, a **signature** is built from the extracted facts
   — the named entities (`who`/`where`), the key numbers (ages, scores,
   amounts, casualty counts), and character trigrams of the core event — and
   scored against recently-published articles by a **weighted Jaccard** where
   shared entities and numbers count far more than shared wording (no extra LLM
   call). A close enough match is dropped as `duplicate-of: <headline>`.
   - Why not compare the summaries directly? Each portal's article is
     summarized independently, so even the same event produces quite different
     prose — lexical overlap alone misses it. The *entities and numbers* are
     what stay stable across portals ("Norveška", "41", "Korčula"), so those
     drive the score.
   - Croatian case declension ("Norveška"/"Norvešku", "Korčula"/"Korčule") is
     handled by stemming entities and by the trigrams — both robust to changing
     word endings.
   - A generic-entity stoplist ("Vlada", "Hrvatska", "policija", …) keeps two
     *different* government or police stories from merging just because they
     share an institution; with those dropped, distinct stories fall back to
     their (differing) event text.
   - The signature is stored on the article row (`articles.dedupe_sig`), so
     later runs dedupe against it symmetrically.

   See `src/pipeline/dedupe.js`; tune via `DEDUPE_WINDOW_HOURS` /
   `DEDUPE_SIMILARITY_THRESHOLD`.
5. **Write summary** (LLM call 2): plain headline / subheadline / body,
   generated from the facts only (never the original prose). This two-step
   split is the copyright-safety mechanism, not just a nice-to-have.
5b. **Hallucination guard** (`src/pipeline/verify.js`, no LLM call): the
   two-step split has a known failure mode — any ambiguity in the facts JSON
   invites the writer (which never sees the article) to fill the gap. An
   observed real case: a source's "project involving 450 musicians" became a
   published "450-minute album". Numbers are the one fact class that's
   mechanically checkable (they survive translation and rewording), so the
   pipeline now enforces, deterministically:
   - every figure in the extracted facts must appear in the source article
     (unsupported `numbers[]` entries are dropped; an invented figure in a
     core field rejects the item);
   - every figure in the written summary must appear in the facts, **and**
     the word immediately following it must too — which is what catches
     "450 glazbenika" being re-attached as "450 minuta";
   - numeric qualifiers must survive intact: facts saying "više od 2700"
     can't become a flat "2700" in the summary (or gain a qualifier the
     facts never had);
   - a failing summary gets one corrective rewrite with the verifier's
     findings fed back, then the item is dropped, never published.
   Alongside: extraction runs at temperature 0 / summary at 0.2, `numbers[]`
   entries must be self-describing ("450 glazbenika u projektu", never a bare
   "450"), and the body word-count *minimum* was removed — padding pressure
   on thin fact-lists is itself a hallucination driver.

   The same self-describing principle applies to entities: `who[]` entries
   carry the person's stated role ("Kylian Mbappé — vodeći strijelac"), and
   purely contextual mentions (historical figures, all-time records) go in a
   separate `background[]` field with their stated context — an observed
   failure had Pelé/Maradona, mentioned only on the all-time scorers list,
   re-attached by the writer as tournament "participants". Role/relationship
   fidelity is prompt-enforced (no deterministic check exists for it);
   `background` is excluded from the dedupe signature so recurring
   contextual name-drops can't manufacture false duplicate matches.

   The same self-describing principle extends to **time and place**: every
   date, time, and venue must be bound to the specific event it belongs to —
   no bare clock times (a time without its day gets read as "today"), no bare
   venues (home/away and which leg kept intact). Two observed failures drove
   this: a return leg played *away* rendered as played "na Poljudu" (the
   already-played first leg's stadium), and final / third-place kickoff times
   printed with no day. Also prompt-enforced (extraction binds the detail into
   the fact string; the writer must not detach it).
5c. **Illustrative image** (`src/pipeline/resolveImage.js`): the source's own
   photo is never used. Instead the summary step also emits a short *English*
   `imageQuery` naming the story's visual theme (never shown to readers), which
   is searched against **Pexels** (free stock, permissive license); the best
   landscape match is hotlinked from Pexels' CDN — never rehosted — and credited
   "Foto: [Photographer] / Pexels". With no `PEXELS_API_KEY`, no match, or a
   network error, the article falls back to a self-hosted **per-category
   placeholder** SVG (`src/publish/assets/placeholders/`, captioned
   "Ilustracija"). A generic thematic photo is clearly decorative rather than
   documentary — the legally-safe and honest choice. See the CLAUDE.md image
   note; tune via `PEXELS_API_KEY` / `IMAGE_FETCH_TIMEOUT_MS`.
6. **Publish**: insert into `articles` with the source's real publish date,
   then regenerate the whole static site — `public/index.html` (the sectioned
   front page), one `public/category/<cat>.html` per category, and one
   `public/article/<id>.html` detail page. Only articles published within
   `ARTICLE_RETENTION_DAYS` are rendered — older ones age out of the live site,
   though their DB row is kept regardless, so the archive is never lost.

### Stub vs. Gemini vs. Anthropic

`LLM_MODE` selects which of the two LLM calls run:

- `stub` (default, no key) — deterministic placeholder output (clearly
  marked), so the full ingest→publish cycle runs offline.
- `gemini` — real Google Gemini summaries. Free tier, no card required — get a
  key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and
  set `GEMINI_API_KEY` + `LLM_MODE=gemini`. Defaults to the current
  "flash-lite" model for the best free daily quota; Google periodically
  retires older flash-lite versions, so if requests start 404ing, list what
  your key can actually call and update `GEMINI_MODEL` in `.env`:
  `curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY"`
- `live` — real Anthropic Claude summaries (paid; no standing free tier). Set
  `ANTHROPIC_API_KEY` + `LLM_MODE=live`.

If the selected mode's key is missing, the app falls back to `stub` rather
than crashing. Switching modes is a `.env` change only — no code changes.

**Gemini free-tier quota — two different limits apply:**

- **Per-minute:** transient `429`s get a few exponential-backoff retries
  automatically, and items that still fail are re-queued for the next run.
- **Per-day (the binding one):** flash-lite allows **500 requests/day**, and
  12 sources produce more than that (~200+ eligible items/day × 2 calls).
  Left unmanaged, the morning's volume exhausts the whole day's quota by
  midday and every evening run publishes nothing (observed live). So each
  run stops after `LLM_CALLS_PER_RUN` calls (default 18 ≈ 8-9 articles):
  18 × ~24-29 runs/day ≈ 430-520 attempts, spreading the quota across the
  whole day. Over-budget items stay `new` and roll to the next run — newest
  news first, across all sources — until the freshness window ages them out.
  During peak news hours some low-priority items will age out unprocessed;
  that's the trade a hard 500/day ceiling forces.

## Configuration

All config is via `.env` (see [`.env.example`](./.env.example) for every option
and its default): LLM mode/model/key, world-importance threshold, freshness
(`FETCH_MAX_AGE_HOURS`, default 3h), per-run LLM budget (`LLM_CALLS_PER_RUN`,
default 18 — see the quota note below) and retention (`ARTICLE_RETENTION_DAYS`,
default 7 days), duplicate detection (`DEDUPE_WINDOW_HOURS`,
`DEDUPE_SIMILARITY_THRESHOLD`), ingest interval (`INGEST_INTERVAL_MIN`, default
60 → hourly at `:00`), DB path, preview port, per-source item caps, fetch
timeout.

## Sources & categories

`src/sources.js` is the single source of truth for feeds. It currently seeds
14 active feeds, all `track: 'hr'`: 10 general Croatian portals, one sports
section (Sportske novosti = jutarnji.hr's sports feed), and three **Svijet
(world) section feeds** (Index.hr, Jutarnji, N1).

World/EU coverage comes from those Svijet sections rather than a foreign wire:
they're world news in Croatian, already curated by each portal's editors for
relevance to Croatian readers — which is the same job the `world`-track
importance gate does for raw wires, so they run `hr`-track (ungated). Content
classification still files them under the "Svijet" category, and cross-portal
dedup collapses the same event reported by several of them. Trade-off: with no
importance gate, the world/domestic ratio is whatever these sections produce
(watch it against the 90/10 target; switch them to `track: 'world'`, or drop
some, if world news over-weights).

`migrate()` syncs the DB to this file: a removed source is set `active = 0`
(its rows/raw_items are kept, it just stops being polled), so deleting a line
here actually stops that feed. Rows currently inactive include HRT (no working
RSS URL found), Al Jazeera, 24sata, Euractiv, and Politico Europe.

Each source has a `track` (`hr` | `world`) — the *selection* axis: Croatian
portals publish everything that passes the junk filter, world-track items
need a high enough importance score (the 90/10 split). This is separate from
an article's own **display category** (`hrvatska`/`zagreb`/`svijet`/`sport`),
which the LLM classifies from the article's actual content during fact
extraction — a Croatian portal's general feed routinely mixes in Zagreb-local
and sport stories, and content-level classification is what actually sorts
them correctly (a per-feed/per-source category can't, since e.g. "on this
day" trivia and Zagreb news show up at ordinary-looking URLs in a portal's
general "vijesti" feed).

To add a source: verify the RSS URL resolves to real XML first (`curl`), then
add a row to `src/sources.js` and re-run `npm run migrate`.

## Front page layout & navigation

Navigation is plain links; the category bar is a sticky, single-row element
(its own `position:sticky` sibling of the header, so it stays pinned while the
page scrolls). Pages are server-rendered and work without JavaScript; the
category feed adds progressive enhancement on top.

- **`index.html`** is a sectioned overview: a mixed **Najnovije** strip (the 8
  newest across all categories) followed by one section per category
  (Hrvatska / Zagreb / Svijet / Sport), each showing its 8 newest and ending
  in a *"Pročitaj sve vijesti u kategoriji …"* link to the full category page.
  Each homepage grid uses the **first row 2 cards, every following row 3**
  rule (2-up tablet, 1-up mobile) via `:nth-child`; no "hero" card, the grid
  decides sizing.
- **`category/<cat>.html`** lists every article in that category (within the
  retention window), newest-first, in a uniform 1/2/3-up grid. Two behaviors
  here (`src/publish/templates.js` → `categoryFeed` / `catFeedScript`):
  - **Date separators**: a full-width day + date row is inserted wherever the
    Zagreb-local day changes, so older news is visibly grouped.
  - **Infinite reveal**: the first `CAT_INITIAL` (11) cards show at load, then
    `CAT_BATCH` (9) more are revealed each time the reader nears the bottom
    (IntersectionObserver), flashing grey skeleton cards during the brief load.
    Everything is server-rendered; the script only toggles visibility, so with
    no JS the whole list renders (nothing is hidden). Featured images also show
    a pulsing skeleton until they load, site-wide.

## Deployment (trial hosting)

For a live trial run, the app deploys via **GitHub Actions + Cloudflare
Pages** rather than an always-on server — this fits the "boring, debuggable
infra" philosophy better than a paid-tier server, and free-tier servers
generally can't run this app correctly: their instances sleep when idle
(breaking a reliable hourly cron) and don't include persistent disk (breaking
SQLite between deploys).

`.github/workflows/ingest-deploy.yml`, on each trigger:

1. Restores `data/news.db` from a dedicated `data` branch (the DB isn't
   tracked on the code branch — see `.gitignore`).
2. Runs one ingest cycle (`node src/index.js ingest`, `LLM_MODE=gemini`),
   which updates the DB and regenerates `public/`.
3. Deploys `public/` to Cloudflare Pages. The generated site is kept out of
   search engines during the private trial via three overlapping layers —
   `public/robots.txt` (disallow all), a `public/_headers` `X-Robots-Tag`
   (Cloudflare Pages sends it on every response), and a `noindex` meta on every
   page — since no single one is airtight alone.
4. Force-pushes a fresh single-commit snapshot of `data/news.db` back to the
   `data` branch (snapshot-only, no history — the app's own
   `ARTICLE_RETENTION_DAYS` already bounds what matters).

### Triggering (why not GitHub's own schedule)

GitHub's built-in `schedule:` event is **best-effort** — it routinely delays
and silently drops runs under load (observed firing only a few times a day
instead of hourly), which is fatal for an aggregator whose whole job is regular
ingestion. So the reliable driver is an **external cron service** hitting the
GitHub API on an exact schedule via the workflow's `repository_dispatch`
trigger; the `schedule:` line is kept only as a no-cost backup.

Set it up with any free cron service that can send an authenticated POST
([cron-job.org](https://cron-job.org) works well):

- **URL:** `https://api.github.com/repos/<owner>/news-aggregator/dispatches`
- **Method:** `POST`
- **Headers:**
  - `Accept: application/vnd.github+json`
  - `Authorization: Bearer <PAT>`
  - `X-GitHub-Api-Version: 2022-11-28`
- **Body:** `{"event_type":"ingest-now"}`
- **Schedule:** every hour (or every 30 min — see the minutes note below)

The `<PAT>` is a **fine-grained** Personal Access Token
(github.com/settings/tokens) scoped to **only this repository** with
**Contents: write** permission (the minimum `repository_dispatch` needs). Store
it in the cron service, never in the repo.

### One-time setup

1. **Cloudflare** (free account): create an API Token with `Account >
   Cloudflare Pages > Edit` permission, and note your Account ID (both shown
   in the Cloudflare dashboard).
2. **GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `GEMINI_API_KEY` — same value as local `.env`
   - `PEXELS_API_KEY` — *optional*; free key from
     [pexels.com/api](https://www.pexels.com/api/) for royalty-free featured
     images. Omit it and articles use self-hosted category placeholders instead.
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Push `.github/workflows/ingest-deploy.yml` (already in the repo). The
   first run creates the Cloudflare Pages project automatically. Trigger it
   immediately via the Actions tab → "Ingest and deploy" → "Run workflow",
   rather than waiting for the next hour.
4. Set up the external cron trigger (see "Triggering" above).
5. The live site is served at `https://no-clickbait-news-aggregator.pages.dev`
   (shown in the Cloudflare dashboard and in each run's deploy log).

Note on Actions minutes: **private** repos get 2,000 free minutes/month. At
~4–5 min per run, reliable hourly (~24 runs/day) is ~2,900–3,600 min/month —
over the cap, so it would pause partway through a month. Options: run every 2h
(comfortably under), or make the repo **public** (public repos get *unlimited*
Actions minutes, so hourly/30-min runs are free indefinitely). The content is
credited public news either way; the trade-off is only whether the code and
generated pages are visible.

## File layout

```
db/schema.sql          Table definitions (sources, raw_items, articles)
src/config.js          Env-driven config
src/sources.js         Source seed list (HR + world)
src/db/                SQLite connection, migration, queries
src/pipeline/          fetchFeeds, filter, extractText, extractFacts, dedupe, writeSummary, run
src/llm/               Gemini + Anthropic clients, prompts, deterministic stub
src/publish/           Static HTML generator + templates
src/scheduler.js       node-cron loop (npm start)
src/serve.js           node:http static preview server
src/index.js           CLI: migrate | ingest | generate | serve | start
test/                  Unit tests for filter, freshness, dedupe (URL + similarity)
```

## Status

v1 scaffold: working RSS ingest → SQLite → static publish, with the LLM steps
stubbed. Live Gemini (free tier) and Anthropic summarization are both wired
but off by default. See the "v2+ ideas" and "Open questions" sections of
`CLAUDE.md` for what's next.
