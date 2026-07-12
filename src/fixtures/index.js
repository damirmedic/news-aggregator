// Bundled fixtures used by offline ingest runs (INGEST_OFFLINE=1 or
// `ingest --offline`). They let the full fetch -> publish cycle complete with
// no network — useful for demos, CI, and sandboxes with no outbound access.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

const HR_FEED = read('sample-feed.xml');
const WORLD_FEED = read('sample-feed-world.xml');
const ARTICLE_HTML = read('sample-article.html');

/** Offline replacement for the RSS fetch: returns feed XML by source track. */
export function offlineFeedFetch(track) {
  return async () => (track === 'world' ? WORLD_FEED : HR_FEED);
}

/** Offline replacement for the article-HTML fetch: one generic body for all. */
export async function offlineHtmlFetch() {
  return ARTICLE_HTML;
}
