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
- **Summarization** via the Anthropic API (`@anthropic-ai/sdk`) — two calls per
  article, and **stubbed by default so the whole pipeline runs with no API key**.
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
3. **Extract full text** of each surviving article (readability).
4. **Extract facts** (LLM call 1): structured who/what/when/where/why JSON,
   from the body only — deliberately discarding the original wording. World
   items also get a 0–10 importance score and are dropped below
   `WORLD_SCORE_THRESHOLD`.
5. **Write summary** (LLM call 2): plain headline / subheadline / body,
   generated from the facts only (never the original prose). This two-step
   split is the copyright-safety mechanism, not just a nice-to-have.
6. **Publish**: insert into `articles`, regenerate `public/index.html`.

### Stub vs. live LLM

With no `ANTHROPIC_API_KEY`, the two LLM calls return deterministic placeholder
output (clearly marked), so the full ingest→publish cycle runs offline and the
site renders real feed data. Set `ANTHROPIC_API_KEY` and `LLM_MODE=live` in
`.env` to switch to real Claude summaries — no code changes.

## Configuration

All config is via `.env` (see [`.env.example`](./.env.example) for every option
and its default): LLM mode/model/key, world-importance threshold, ingest
interval, DB path, preview port, per-source item caps, fetch timeout.

## Sources

The full source list from `CLAUDE.md` is seeded in `src/sources.js`, but only
**Index.hr** (+ one world feed) is `active` by default, for a tame first run.
Each remaining feed's URL and terms of service must be confirmed before it's
enabled — flip `active: true` in `src/sources.js` and re-run `npm run migrate`.

## Layout

```
db/schema.sql          Table definitions (sources, raw_items, articles)
src/config.js          Env-driven config
src/sources.js         Source seed list (HR + world)
src/db/                SQLite connection, migration, queries
src/pipeline/          fetchFeeds, filter, extractText, extractFacts, writeSummary, run
src/llm/               Anthropic client, prompts, deterministic stub
src/publish/           Static HTML generator + templates
src/scheduler.js       node-cron loop (npm start)
src/serve.js           node:http static preview server
src/index.js           CLI: migrate | ingest | generate | serve | start
test/                  Unit tests for filter + dedupe
```

## Status

v1 scaffold: working RSS ingest → SQLite → static publish, with the LLM steps
stubbed. Live Anthropic summarization is wired but off by default. See the
"v2+ ideas" and "Open questions" sections of `CLAUDE.md` for what's next.
