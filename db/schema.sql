-- No-Clickbait News Aggregator — schema
-- Follows the rough data model in CLAUDE.md, with two pragmatic additions:
--   raw_items.status + raw_items.filter_reason  (pipeline state / debuggability)
--   articles.world_score                        (90/10 HR/world gating)
--
-- Applied idempotently by src/db/index.js:migrate(). SQLite dialect.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- News sources (RSS feeds). Seeded from src/sources.js.
-- `track` is the selection track (Croatian portal vs international wire) —
-- not the article's display category; see articles.category below.
CREATE TABLE IF NOT EXISTS sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  rss_url    TEXT    NOT NULL UNIQUE,
  track      TEXT    NOT NULL CHECK (track IN ('hr', 'world')),
  active     INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1))
);

-- Raw feed items, one row per unique article URL. Deduped by `link`.
-- status lifecycle:
--   new -> filtered            (dropped by scope/junk filter; see filter_reason)
--   new -> extracted           (full text pulled)
--       -> summarized          (LLM produced an article row)
--       -> published           (rendered to the site)
--       -> error               (unrecoverable failure this run; ret/re-tried later)
CREATE TABLE IF NOT EXISTS raw_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL,
  link          TEXT    NOT NULL UNIQUE,
  pub_date      TEXT,                                 -- ISO-8601, source-provided
  fetched_at    TEXT    NOT NULL,                     -- ISO-8601, when we first saw it
  status        TEXT    NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','filtered','extracted','summarized','published','error')),
  filter_reason TEXT                                  -- why it was filtered / why it errored
);

CREATE INDEX IF NOT EXISTS idx_raw_items_status    ON raw_items(status);
CREATE INDEX IF NOT EXISTS idx_raw_items_source    ON raw_items(source_id);

-- Published summaries. One row per successfully summarized raw_item.
-- `category` is the article's own display category, classified from its
-- actual content by the LLM during fact extraction — independent of which
-- source/track it came from (a Croatian portal can publish a 'svijet' or
-- 'sport' story; a world-wire item is still gated by world_score first).
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_item_id  INTEGER NOT NULL UNIQUE REFERENCES raw_items(id) ON DELETE CASCADE,
  headline     TEXT    NOT NULL,
  subheadline  TEXT,
  body         TEXT    NOT NULL,
  source_name  TEXT    NOT NULL,
  source_url   TEXT    NOT NULL,
  category     TEXT    NOT NULL CHECK (category IN ('hrvatska', 'zagreb', 'svijet', 'sport')),
  world_score  INTEGER,                               -- 0-10 for world-track items, NULL for hr-track
  published_at TEXT    NOT NULL,                      -- ISO-8601, from the source (see run.js)
  image_url    TEXT                                   -- hotlinked source featured image; see CLAUDE.md caveat
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles(category);
