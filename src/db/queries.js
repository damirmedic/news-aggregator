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
            category, world_score, published_at, image_url)
         VALUES (@rawItemId, @headline, @subheadline, @body, @sourceName, @sourceUrl,
            @category, @worldScore, @publishedAt, @imageUrl)`
      )
      .run(a);
    db.prepare(`UPDATE raw_items SET status = 'published' WHERE id = ?`).run(a.rawItemId);
    return info.lastInsertRowid;
  });
  return tx(article);
}

/** Published articles for the site, newest first. */
export function getPublishedArticles({ limit = 200 } = {}) {
  return getDb()
    .prepare(
      `SELECT id, headline, subheadline, body, source_name AS sourceName,
              source_url AS sourceUrl, category, world_score AS worldScore,
              published_at AS publishedAt, image_url AS imageUrl
       FROM articles
       ORDER BY published_at DESC
       LIMIT ?`
    )
    .all(limit);
}

/** Count rows grouped by status — handy for run summaries / debugging. */
export function statusCounts() {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM raw_items GROUP BY status')
    .all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
