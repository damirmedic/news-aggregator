// Orchestrates one full ingestion cycle: fetch -> filter -> extract text ->
// extract facts -> write summary -> publish, then regenerate the static site.
// Everything runs automatically, no human in the loop (CLAUDE.md core principle).
import { config } from '../config.js';
import { migrate } from '../db/index.js';
import {
  getActiveSources,
  getNewItemsForSource,
  getRecentArticleSignatures,
  markFiltered,
  markStatus,
  insertArticle,
  requeueRateLimitedErrors,
  statusCounts,
} from '../db/queries.js';
import { fetchSource } from './fetchFeeds.js';
import { shouldDrop, isTooOld } from './filter.js';
import { extractArticleText } from './extractText.js';
import { extractFactsForItem } from './extractFacts.js';
import { writeSummaryForItem } from './writeSummary.js';
import { buildSignature, findDuplicate } from './dedupe.js';
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

  // Give last cycle's rate-limit casualties another chance while they're
  // still fresh (see requeueRateLimitedErrors — too-old ones die cleanly).
  const requeued = requeueRateLimitedErrors();
  if (requeued > 0) log(`re-queued ${requeued} rate-limited items from previous runs`);

  const totals = {
    fetched: 0,
    filtered: 0,
    tooOld: 0,
    extractErrors: 0,
    nonNews: 0,
    belowThreshold: 0,
    duplicates: 0,
    published: 0,
  };

  // In-memory duplicate-detection index: seeded from recently-published
  // articles, then grown as this run itself publishes new ones — so two
  // portals covering the same event in the same run still get caught, not
  // just duplicates against prior runs.
  const dedupeWindowMs = config.dedupe.windowHours * 60 * 60 * 1000;
  const dedupeSinceIso = new Date(Date.now() - dedupeWindowMs).toISOString();
  const recentSignatures = getRecentArticleSignatures(dedupeSinceIso).map((a) => ({
    headline: a.headline,
    sig: parseSignature(a.dedupeSig),
  }));

  // --- Phase 1: fetch feeds ---
  for (const source of sources) {
    try {
      const feedFetch = offline ? offlineFeedFetch(source.track) : undefined;
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
      await processItem(item, source, { offline, totals, recentSignatures });
    }
  }

  if (!skipGenerate) {
    const { count } = generateSite();
    log(`site regenerated with ${count} articles`);
  }

  log('done:', JSON.stringify(totals), '| statuses:', JSON.stringify(statusCounts()));
  return totals;
}

async function processItem(item, source, { offline, totals, recentSignatures }) {
  // Step 2: scope / junk filter
  const drop = shouldDrop({ title: item.title, link: item.link });
  if (drop.drop) {
    markFiltered(item.id, drop.reason);
    totals.filtered++;
    return;
  }

  // Step 2b: freshness — keep the site current, not a backlog dump.
  if (isTooOld(item.pubDate, config.freshness.maxAgeHours)) {
    markFiltered(item.id, 'too-old');
    totals.tooOld++;
    return;
  }

  // Step 3: full-text extraction
  let bodyText, publishedTime, imageUrl;
  try {
    const htmlFetch = offline ? offlineHtmlFetch : undefined;
    ({ text: bodyText, publishedTime, imageUrl } = await extractArticleText(item.link, { fetchImpl: htmlFetch }));
    markStatus(item.id, 'extracted');
  } catch (err) {
    markStatus(item.id, 'error', `extract: ${err.message}`);
    totals.extractErrors++;
    return;
  }

  // Step 4: extract facts (+ is-current-news, world-importance, and
  // article-category-classification gates)
  let facts, worldScore, isCurrentNews, category, passesGate;
  try {
    ({ facts, worldScore, isCurrentNews, category, passesGate } = await extractFactsForItem({
      title: item.title,
      bodyText,
      track: source.track,
    }));
  } catch (err) {
    markStatus(item.id, 'error', `facts: ${err.message}`);
    totals.extractErrors++;
    return;
  }

  if (!passesGate) {
    if (!isCurrentNews) {
      markFiltered(item.id, 'non-current-news-content');
      totals.nonNews++;
    } else {
      markFiltered(item.id, `below-world-threshold (${worldScore})`);
      totals.belowThreshold++;
    }
    return;
  }

  // Step 4b: cross-portal duplicate check — before the (costlier) summary
  // call, since a duplicate never gets published either way. The signature is
  // built from the extracted facts (entities/numbers/event), then reused as
  // this article's own stored signature if it does get published.
  const signature = buildSignature(facts);
  const duplicate = findDuplicate(signature, recentSignatures, config.dedupe.similarityThreshold);
  if (duplicate) {
    markFiltered(item.id, `duplicate-of: ${duplicate.headline.slice(0, 80)}`);
    totals.duplicates++;
    return;
  }

  // Step 5: write summary + publish
  try {
    const summary = await writeSummaryForItem({ facts, sourceName: source.name, category });
    insertArticle({
      rawItemId: item.id,
      headline: summary.headline,
      subheadline: summary.subheadline,
      body: summary.body,
      sourceName: source.name,
      sourceUrl: item.link,
      category,
      worldScore,
      // RSS pubDate first: in practice it carries minute-level precision,
      // while page <meta> published-time tags are often date-only (seen on
      // Index.hr). Page metadata is still a useful fallback for feeds that
      // omit pubDate; "now" is a last resort, not the real publish time.
      publishedAt: resolvePublishedAt(item.pubDate, publishedTime, item.fetchedAt),
      // Hotlinked from the source, never downloaded/stored — see the image
      // credit rendered alongside it in publish/templates.js.
      imageUrl,
      // Persist the signature so future runs can dedupe against this article.
      dedupeSig: JSON.stringify(signature),
    });
    totals.published++;
    // Grow the in-run dedupe index so later items (possibly from other
    // portals) get compared against this one too — same signature we stored.
    recentSignatures.push({ headline: summary.headline, sig: signature });
  } catch (err) {
    markStatus(item.id, 'error', `summary: ${err.message}`);
    totals.extractErrors++;
  }
}

/** Parse a stored dedupe signature JSON string; null if absent/corrupt. */
function parseSignature(json) {
  if (!json) return null;
  try {
    const sig = JSON.parse(json);
    if (sig && Array.isArray(sig.e) && Array.isArray(sig.n) && typeof sig.w === 'string') return sig;
  } catch {
    // fall through
  }
  return null;
}

/** First valid date among the given candidates, in caller-specified priority order. */
function resolvePublishedAt(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const t = new Date(candidate).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}
