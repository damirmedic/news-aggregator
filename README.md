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
   `filter_reason`. The default (1h) pairs with the hourly schedule: each run
   only pays for the full-text + LLM steps on the last hour's fresh items.
3. **Extract full text** of each surviving article (readability), plus its
   real publish timestamp and featured-image URL from the page's own
   metadata (hotlinked with credit — see the CLAUDE.md caveat).
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

With 12 active sources, a single ingest cycle can fire well over 100 Gemini
calls (2 per surviving item) in quick succession — easy to hit the free
tier's per-minute cap. Transient `429`s get a few exponential-backoff
retries automatically; if you still see rate-limit errors in the run
summary, lower `MAX_ITEMS_PER_SOURCE` in `.env`.

## Configuration

All config is via `.env` (see [`.env.example`](./.env.example) for every option
and its default): LLM mode/model/key, world-importance threshold, freshness
(`FETCH_MAX_AGE_HOURS`, default 1h) and retention (`ARTICLE_RETENTION_DAYS`,
default 7 days), duplicate detection (`DEDUPE_WINDOW_HOURS`,
`DEDUPE_SIMILARITY_THRESHOLD`), ingest interval (`INGEST_INTERVAL_MIN`, default
60 → hourly at `:00`), DB path, preview port, per-source item caps, fetch
timeout.

## Sources & categories

`src/sources.js` seeds 12 active feeds: 11 Croatian portals (Index.hr,
Index.hr Sport, 24sata, Jutarnji list, Večernji list, N1, Dnevnik.hr, Novi
list, Slobodna Dalmacija, Tportal, Net.hr — each `rssUrl` verified live) plus
Al Jazeera as the world wire. HRT, Euractiv, and Politico Europe are seeded
`active: false` — no working RSS URL found for HRT as of this writing; the
other two need a license-terms check before enabling.

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

The site is fully static — no client-side JavaScript, navigation is plain
links.

- **`index.html`** is a sectioned overview: a mixed **Najnovije** strip (the 8
  newest across all categories) followed by one section per category
  (Hrvatska / Zagreb / Svijet / Sport), each showing its 8 newest and ending
  in a *"Pročitaj sve vijesti u kategoriji …"* link to the full category page.
- **`category/<cat>.html`** lists every article in that category (within the
  retention window). The masthead nav links to these pages and highlights the
  active one.

Every grid — homepage sections and category pages alike — uses the same
`.story-grid` rule (`src/publish/templates.js` + `styles.css`): **first row 2
cards, every following row 3** on desktop (2-up tablet, 1-up mobile). There's
no "hero" card; the grid, not the card, decides sizing, and because each grid
holds a contiguous set of cards (nothing hidden client-side), the `:nth-child`
rule that widens the first two cards always targets the real first row.

## Deployment (trial hosting)

For a live trial run, the app deploys via **GitHub Actions + Cloudflare
Pages** rather than an always-on server — this fits the "boring, debuggable
infra" philosophy better than a paid-tier server, and free-tier servers
generally can't run this app correctly: their instances sleep when idle
(breaking a reliable hourly cron) and don't include persistent disk (breaking
SQLite between deploys).

`.github/workflows/ingest-deploy.yml` runs hourly (GitHub's own scheduler,
independent of any server staying awake — see the workflow file for why):

1. Restores `data/news.db` from a dedicated `data` branch (the DB isn't
   tracked on the code branch — see `.gitignore`).
2. Runs one ingest cycle (`node src/index.js ingest`, `LLM_MODE=gemini`),
   which updates the DB and regenerates `public/`.
3. Deploys `public/` to Cloudflare Pages.
4. Force-pushes a fresh single-commit snapshot of `data/news.db` back to the
   `data` branch (snapshot-only, no history — the app's own
   `ARTICLE_RETENTION_DAYS` already bounds what matters).

### One-time setup

1. **Cloudflare** (free account): create an API Token with `Account >
   Cloudflare Pages > Edit` permission, and note your Account ID (both shown
   in the Cloudflare dashboard).
2. **GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `GEMINI_API_KEY` — same value as local `.env`
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Push `.github/workflows/ingest-deploy.yml` (already in the repo). The
   first run creates the Cloudflare Pages project automatically. Trigger it
   immediately via the Actions tab → "Ingest and deploy" → "Run workflow",
   rather than waiting for the next hour.
4. The live site is served at `https://no-clickbait-news-aggregator.pages.dev`
   (shown in the Cloudflare dashboard and in each run's deploy log).

Note: GitHub Actions gives private repos 2,000 free minutes/month — an hourly
run for a week or two fits comfortably; running it hourly indefinitely for a
full month is close to the cap.

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
