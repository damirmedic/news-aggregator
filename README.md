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

One ingestion cycle (`npm run ingest`, or every `INGEST_INTERVAL_MIN` under
`npm start`) does, per active source:

1. **Fetch** the RSS feed, insert new items into `raw_items` (deduped by URL).
2. **Filter** out-of-scope junk (horoscopes, galleries, video-only, sponsored,
   sports live-tickers, …) by pattern; dropped items keep a `filter_reason`.
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
5. **Write summary** (LLM call 2): plain headline / subheadline / body,
   generated from the facts only (never the original prose). This two-step
   split is the copyright-safety mechanism, not just a nice-to-have.
6. **Publish**: insert into `articles` with the source's real publish date,
   regenerate `public/index.html` + one detail page per article.

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
and its default): LLM mode/model/key, world-importance threshold, ingest
interval, DB path, preview port, per-source item caps, fetch timeout.

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

## Layout

```
db/schema.sql          Table definitions (sources, raw_items, articles)
src/config.js          Env-driven config
src/sources.js         Source seed list (HR + world)
src/db/                SQLite connection, migration, queries
src/pipeline/          fetchFeeds, filter, extractText, extractFacts, writeSummary, run
src/llm/               Gemini + Anthropic clients, prompts, deterministic stub
src/publish/           Static HTML generator + templates
src/scheduler.js       node-cron loop (npm start)
src/serve.js           node:http static preview server
src/index.js           CLI: migrate | ingest | generate | serve | start
test/                  Unit tests for filter + dedupe
```

## Status

v1 scaffold: working RSS ingest → SQLite → static publish, with the LLM steps
stubbed. Live Gemini (free tier) and Anthropic summarization are both wired
but off by default. See the "v2+ ideas" and "Open questions" sections of
`CLAUDE.md` for what's next.
