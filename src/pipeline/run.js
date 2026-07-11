// Orchestrates one full ingestion cycle: fetch -> filter -> extract text ->
// extract facts -> write summary -> publish, then regenerate the static site.
// Everything runs automatically, no human in the loop (CLAUDE.md core principle).
import { config } from '../config.js';
import { migrate } from '../db/index.js';
import {
  getActiveSources,
  getNewItemsForSource,
  markFiltered,
  markStatus,
  insertArticle,
  statusCounts,
} from '../db/queries.js';
import { fetchSource } from './fetchFeeds.js';
import { shouldDrop } from './filter.js';
import { extractArticleText } from './extractText.js';
import { extractFactsForItem } from './extractFacts.js';
import { writeSummaryForItem } from './writeSummary.js';
import { generateSite } from '../publish/generate.js';
import { offlineFeedFetch, offlineHtmlFetch } from '../fixtures/index.js';

const log = (...args) => console.log('[ingest]', ...args);

/**
 * Run one ingestion cycle.
 * @param opts.offline  use bundled fixtures instead of the network
 * @param opts.skipGenerate  don't regenerate the site (caller will)
 * @returns run summary counts
 */
export async function runIngestCycle({ offline = false, skipGenerate = false } = {}) {
  migrate(); // idempotent: ensures schema + source seed are current

  const sources = getActiveSources();
  log(`mode=${config.llm.mode} offline=${offline} active_sources=${sources.length}`);

  const totals = { fetched: 0, filtered: 0, extractErrors: 0, belowThreshold: 0, published: 0 };

  // --- Phase 1: fetch feeds ---
  for (const source of sources) {
    try {
      const feedFetch = offline ? offlineFeedFetch(source.category) : undefined;
      const { found, inserted } = await fetchSource(source, { fetchImpl: feedFetch });
      totals.fetched += inserted;
      log(`fetched ${source.name}: ${inserted} new / ${found} in feed`);
    } catch (err) {
      log(`fetch failed for ${source.name}: ${err.message}`);
    }
  }

  // --- Phase 2: process new items per source ---
  for (const source of sources) {
    const items = getNewItemsForSource(source.id, config.ingest.maxItemsPerSource);
    for (const item of items) {
      await processItem(item, source, { offline, totals });
    }
  }

  if (!skipGenerate) {
    const { count } = generateSite();
    log(`site regenerated with ${count} articles`);
  }

  log('done:', JSON.stringify(totals), '| statuses:', JSON.stringify(statusCounts()));
  return totals;
}

async function processItem(item, source, { offline, totals }) {
  // Step 2: scope / junk filter
  const drop = shouldDrop({ title: item.title, link: item.link });
  if (drop.drop) {
    markFiltered(item.id, drop.reason);
    totals.filtered++;
    return;
  }

  // Step 3: full-text extraction
  let bodyText;
  try {
    const htmlFetch = offline ? offlineHtmlFetch : undefined;
    ({ text: bodyText } = await extractArticleText(item.link, { fetchImpl: htmlFetch }));
    markStatus(item.id, 'extracted');
  } catch (err) {
    markStatus(item.id, 'error', `extract: ${err.message}`);
    totals.extractErrors++;
    return;
  }

  // Step 4: extract facts (+ world-importance gate)
  let facts, worldScore, passesGate;
  try {
    ({ facts, worldScore, passesGate } = await extractFactsForItem({
      title: item.title,
      bodyText,
      category: source.category,
    }));
  } catch (err) {
    markStatus(item.id, 'error', `facts: ${err.message}`);
    totals.extractErrors++;
    return;
  }

  if (!passesGate) {
    markFiltered(item.id, `below-world-threshold (${worldScore})`);
    totals.belowThreshold++;
    return;
  }

  // Step 5: write summary + publish
  try {
    const summary = await writeSummaryForItem({ facts, sourceName: source.name, category: source.category });
    insertArticle({
      rawItemId: item.id,
      headline: summary.headline,
      subheadline: summary.subheadline,
      body: summary.body,
      sourceName: source.name,
      sourceUrl: item.link,
      category: source.category,
      worldScore,
      publishedAt: new Date().toISOString(),
    });
    totals.published++;
  } catch (err) {
    markStatus(item.id, 'error', `summary: ${err.message}`);
    totals.extractErrors++;
  }
}
