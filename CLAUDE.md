# Project: No-Clickbait News Aggregator

## What this is

Fully automated news aggregator/summarizer. Pulls articles from Croatian news
portals (90%) plus major EU/world news (10%), rewrites each into a short,
factual, old-school-reporting-style summary, and publishes it. No manual
curation, no editorial approval step, no user accounts needed for v1. It runs
itself.

## Core principles (don't compromise on these)

- **Automatic end to end.** Ingest → summarize → publish, no human in the
  loop. If something needs manual review to be safe (legal, factual), it gets
  filtered out automatically, not queued for me to check.
- **No clickbait, anywhere.** Headlines and subheadlines are plain,
  descriptive, boring-on-purpose. Old wire-service style: what happened, who's
  involved, when, where, why it matters — in that order of priority. No
  questions as headlines, no "you won't believe," no withheld information, no
  emotional bait.
- **Legally clean by construction.** Never store or display more than a
  headline + short original quote fragment from a source. Summaries are
  written from an extracted fact-list, not from paraphrasing the source
  prose, so they don't closely mirror the original's wording or structure.
  Always link to and credit the original source. See "Content pipeline"
  below — the two-step extract-then-write process is the actual copyright
  safety mechanism, not just a nice-to-have.
  **Images — resolved 2026-07-15 (superseded the 2026-07-11 exception below).**
  Article pages no longer touch the source's own photo at all. Each article
  now gets an *illustrative* image via `src/pipeline/resolveImage.js`:
    1. a royalty-free **Pexels** photo matched to the story's theme (a short
       English `imageQuery` the summary step emits), hotlinked from Pexels'
       own CDN — which their license/API guidelines expressly permit — and
       credited "Foto: [Photographer] / Pexels"; or
    2. if there's no key, no match, or a network error, a **self-hosted
       per-category placeholder** SVG (`src/publish/assets/placeholders/`),
       captioned "Ilustracija".
  A generic thematic stock photo is clearly decorative rather than purporting
  to document the event, which is both the legally-safe and the honest choice.
  Nothing copyrighted from the source is embedded or rehosted, so the images
  are legally clean by construction like the text. The whole site is also
  `noindex`/`robots`-blocked (robots.txt + `X-Robots-Tag` + meta) so it stays
  out of search engines during the private trial.
  _Original exception (2026-07-11, now removed): article pages used to hotlink
  the source's `og:image` with a "Foto: [Source]" credit — never downloaded,
  but still "more than headline + quote." That is the deviation the above
  resolves._
- **90/10 split.** Croatian domestic news dominates the feed. World/EU news
  only surfaces if it clears a "genuinely important" bar (see Selection
  logic) — not routine wire coverage.
- **Simple stack.** No frameworks/build pipelines beyond what's needed.
  Prefer boring, debuggable infrastructure over clever infrastructure.

## Tech stack (v1)

- **Runtime:** Node.js. Single backend service, no microservices.
- **Scheduling:** cron (node-cron or system cron) triggering an ingestion run
  every 30–60 min.
- **Storage:** SQLite. No need for Postgres/hosted DB at this scale — single
  file, easy to inspect, easy to back up.
- **Summarization:** Anthropic API (Claude), two-step prompt per article (see
  pipeline).
- **Frontend:** Plain HTML/CSS/vanilla JS, server-rendered or a static
  generated page rebuilt on each ingestion cycle. No React/Next unless the
  site grows enough to need it. Mobile-first, fast-loading, minimal.
- **Hosting:** cheap VPS or similar, wherever the cron + SQLite + static
  output can live together. No serverless complexity needed for v1.

## Content pipeline

1. **Fetch:** Pull RSS feeds on a schedule from the source list below.
   Store raw feed items (title, link, pubDate, source) in a `raw_items`
   table, dedupe by URL.
2. **Filter:** Drop items outside scope (sponsored content, horoscopes,
   galleries, video-only posts, sports live-tickers, etc — build a
   source-specific exclude list as we learn each feed's junk categories).
3. **Fetch full text:** Grab the article HTML, extract main body text
   (readability-style extraction, e.g. `@mozilla/readability` +
   `jsdom`, or `article-extractor`).
4. **Extract facts (LLM call 1):** Prompt Claude to pull structured facts
   from the article body only — who, what, when, where, why, key numbers,
   direct quotes worth attributing. Output JSON. This step deliberately
   throws away the original sentence structure/wording. (**Amended
   2026-07-14:** `who` entries carry each actor's stated role, and a separate
   `background` field holds purely contextual mentions with their stated
   context — bare names/figures in the facts JSON invite the writer, which
   never sees the article, to invent the missing relationship. Both observed
   live: "450 musicians" → "450-minute album"; Pelé/Maradona on the all-time
   scorers list → "tournament participants".) (**Amended 2026-07-16:** same
   self-describing principle now extended to time and place — every date, time,
   and venue must be bound to the specific event it belongs to, no bare clock
   times (a time without its day reads as "today") and no bare venues (keep
   home/away + which leg). Both observed live: a return leg the team plays
   *away* rendered as played "na Poljudu" — the first leg's venue; and final /
   third-place kickoff times printed with no day.)
5. **Write summary (LLM call 2):** From the structured facts (not the
   original text), generate:
   - Headline (plain, factual, ≤ ~12 words)
   - Subheadline (one sentence, adds the next layer of detail)
   - Body summary (up to ~400-500 words, plain reporting style; **amended
     2026-07-12:** the 200-word *minimum* was removed — a hard floor
     pressured the model to pad thin fact-lists with invented detail, and a
     real hallucination traced back to exactly that. Length now scales with
     the extracted facts; short-but-accurate beats long-but-padded.)
   This call never sees the original prose — only the extracted facts —
   which is what keeps the output from being a close paraphrase.
5b. **Verify (added 2026-07-12, no LLM):** deterministic numeric-consistency
   guard between the three text layers — figures in the facts must exist in
   the source, figures in the summary must exist in the facts *with the same
   adjacent unit/referent*. One corrective retry, then the item is dropped
   automatically (never queued for review). See `src/pipeline/verify.js`.
6. **Source + credit:** Store source name + original URL, displayed with
   every summary. No verbatim quotes longer than ~10-15 words, ever, and
   at most one short quoted fragment per article.
7. **Publish:** Insert into `articles` table, regenerate/update the site.

## Selection logic (90/10 + no manual approval)

- Croatian sources: publish everything that passes the junk filter (step 2
  above) — this is the bulk of the feed.
- EU/world sources: only publish if the story clears an "importance"
  threshold. Cheapest way to automate this without manual review: ask the
  LLM to score each fetched world item 0–10 for likely relevance to a
  Croatian reader (major EU policy, war/conflict, global economy, natural
  disasters, etc.) during the fact-extraction step, and only proceed past
  filtering if score ≥ some threshold (tune this, start around 7).
- Keep the 90/10 ratio as a rough daily target, not a hard rule enforced
  in code — revisit after seeing real volume.

## Data model (rough)

- `raw_items`: id, source, title, link, pub_date, fetched_at, status
- `articles`: id, raw_item_id, headline, subheadline, body, source_name,
  source_url, category, published_at
- `sources`: id, name, rss_url, category (hr/world), active

## Source list (starting point)

Croatian (RSS confirmed available):
- Index.hr — index.hr/rss (+ category feeds)
- 24sata
- Jutarnji list
- Večernji list
- N1.hr
- HRT
- Dnevnik.hr
- Novi list
- Slobodna Dalmacija

EU/World (pick 2-3 reputable wire-style sources with RSS):
- Reuters, AP, or similar wire service feed
- Politico Europe or similar for EU policy

(Confirm each feed URL and check ToS/robots.txt before hooking up — some may
require checking terms even though RSS is publicly published.)

## Editorial style guide (for the summarization prompt)

- Headline: subject + verb + object, present or past tense, no wordplay,
  no rhetorical questions, no "this changes everything" framing.
- Subheadline: the second most important fact, one sentence.
- Body: inverted pyramid — most important info first, context/background
  last. No speculation, no editorializing, no emotional language.
- If the underlying story is inherently sensational (crime, disaster),
  report it plainly — factual severity is fine, sensationalized framing
  is not.

## MVP feature list

1. RSS ingestion for full Croatian source list
2. Full-text extraction + two-step summarization pipeline
3. SQLite storage
4. Basic public site: reverse-chronological feed, source credit + link per
   item, simple category filter (HR / World)
5. Cron-driven, fully automatic, no admin/approval UI

## v2+ ideas (not now)

- World/EU source expansion once HR pipeline is stable
- Topic clustering (same story from multiple HR portals → one summary)
- Search
- Email digest
- RSS feed of our own output

## Open questions to resolve early

- Which specific EU/world wire sources to use (RSS availability + license
  terms)
- Where this gets hosted
- Whether SQLite is enough long-term or we outgrow it fast (probably fine
  for a while)
