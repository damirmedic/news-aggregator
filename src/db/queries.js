// Data-access helpers over the SQLite connection. Thin, prepared-statement
// wrappers so the pipeline never writes raw SQL inline.
import { getDb } from './index.js';

export function getActiveSources() {
  return getDb()
    .prepare('SELECT id, name, rss_url AS rssUrl, track FROM sources WHERE active = 1')
    .all();
}

/**
 * Insert a feed item if its URL is new. Returns the new row id, or null if the
 * link already exists (deduped). `INSERT OR IGNORE` relies on the UNIQUE(link).
 */
export function insertRawItem({ sourceId, title, link, pubDate, fetchedAt }) {
  const info = getDb()
    .prepare(
      `INSERT OR IGNORE INTO raw_items (source_id, title, link, pub_date, fetched_at, status)
       VALUES (?, ?, ?, ?, ?, 'new')`
    )
    .run(sourceId, title, link, pubDate ?? null, fetchedAt);
  return info.changes === 1 ? info.lastInsertRowid : null;
}

/** Items still awaiting processing for a given source, newest first, capped. */
export function getNewItemsForSource(sourceId, limit) {
  return getDb()
    .prepare(
      `SELECT id, source_id AS sourceId, title, link, pub_date AS pubDate,
              fetched_at AS fetchedAt
       FROM raw_items
       WHERE source_id = ? AND status = 'new'
       ORDER BY COALESCE(pub_date, fetched_at) DESC
       LIMIT ?`
    )
    .all(sourceId, limit);
}

export function markFiltered(rawItemId, reason) {
  getDb()
    .prepare(`UPDATE raw_items SET status = 'filtered', filter_reason = ? WHERE id = ?`)
    .run(reason, rawItemId);
}

export function markStatus(rawItemId, status, reason = null) {
  getDb()
    .prepare(`UPDATE raw_items SET status = ?, filter_reason = ? WHERE id = ?`)
    .run(status, reason, rawItemId);
}

/**
 * Insert a finished summary and flag the raw_item published, atomically.
 * Returns the new article id.
 */
export function insertArticle(article) {
  const db = getDb();
  const tx = db.transaction((a) => {
    const info = db
      .prepare(
        `INSERT INTO articles
           (raw_item_id, headline, subheadline, body, source_name, source_url,
            category, world_score, published_at, image_url, image_credit,
            image_credit_url, dedupe_sig)
         VALUES (@rawItemId, @headline, @subheadline, @body, @sourceName, @sourceUrl,
            @category, @worldScore, @publishedAt, @imageUrl, @imageCredit,
            @imageCreditUrl, @dedupeSig)`
      )
      .run(a);
    db.prepare(`UPDATE raw_items SET status = 'published' WHERE id = ?`).run(a.rawItemId);
    return info.lastInsertRowid;
  });
  return tx(article);
}

/**
 * Published articles for the site, newest first, within the retention
 * window. The DB row stays forever regardless — this only bounds what
 * generateSite() renders (see config.freshness.articleRetentionDays).
 */
export function getPublishedArticles({ sinceIso, limit = 500 } = {}) {
  return getDb()
    .prepare(
      `SELECT id, headline, subheadline, body, source_name AS sourceName,
              source_url AS sourceUrl, category, world_score AS worldScore,
              published_at AS publishedAt, image_url AS imageUrl,
              image_credit AS imageCredit, image_credit_url AS imageCreditUrl
       FROM articles
       WHERE published_at >= ?
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(sinceIso ?? '0000-00-00', limit);
}

/**
 * Recent articles' stored duplicate-detection signatures (see
 * pipeline/dedupe.js), for catching the same story across portals. Not scoped
 * to the retention window — a duplicate check should look back further than
 * what's currently on-site. Returns the raw JSON `dedupeSig` string; the caller
 * parses it (keeps this layer free of the signature format).
 */
export function getRecentArticleSignatures(sinceIso) {
  return getDb()
    .prepare(`SELECT headline, dedupe_sig AS dedupeSig FROM articles WHERE published_at >= ? ORDER BY published_at DESC`)
    .all(sinceIso);
}

/**
 * Re-queue items that errored on a rate limit (HTTP 429) so the next cycle
 * retries them — quota exhaustion is transient (resets daily on the Gemini
 * free tier) and shouldn't permanently swallow an hour of news. Naturally
 * bounded: once a re-queued item ages past FETCH_MAX_AGE_HOURS it gets
 * filtered as too-old instead of retrying forever.
 */
export function requeueRateLimitedErrors() {
  const info = getDb()
    .prepare(
      `UPDATE raw_items SET status = 'new', filter_reason = NULL
       WHERE status = 'error' AND filter_reason LIKE '%429%'`
    )
    .run();
  return info.changes;
}

/** Count rows grouped by status — handy for run summaries / debugging. */
export function statusCounts() {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM raw_items GROUP BY status')
    .all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
