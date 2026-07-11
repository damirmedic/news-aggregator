// Step 1: pull each active source's RSS feed and insert new items into
// raw_items (deduped by URL). Uses native fetch (Node 20) + rss-parser.
import Parser from 'rss-parser';
import { config } from '../config.js';
import { insertRawItem } from '../db/queries.js';

const parser = new Parser({ timeout: config.ingest.fetchTimeoutMs });

/** Fetch a URL as text with a timeout and a polite User-Agent. */
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ingest.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': config.ingest.userAgent, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + parse a single source's feed and insert new items.
 * @param source { id, name, rssUrl, category }
 * @param opts.fetchImpl optional override returning feed XML (for tests/fixtures)
 * @returns {{ found: number, inserted: number }}
 */
export async function fetchSource(source, { fetchImpl = fetchText } = {}) {
  const xml = await fetchImpl(source.rssUrl);
  const feed = await parser.parseString(xml);
  const fetchedAt = new Date().toISOString();

  let inserted = 0;
  for (const item of feed.items ?? []) {
    const link = (item.link || '').trim();
    const title = (item.title || '').trim();
    if (!link || !title) continue;

    const pubDate = item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : null);
    const id = insertRawItem({ sourceId: source.id, title, link, pubDate, fetchedAt });
    if (id !== null) inserted++;
  }

  return { found: feed.items?.length ?? 0, inserted };
}
