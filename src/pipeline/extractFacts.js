// Step 4: LLM call 1 (extract facts) + two gates, plus article-category
// classification:
//   - is_current_news: drops historical trivia, gossip, lifestyle content that
//     slips past the URL/title filter under an ordinary-looking news URL
//     (this is what actually catches "on this day" retrospectives — their
//     URLs are indistinguishable from real articles).
//   - world_importance (world-track sources only): the 90/10 selection
//     threshold. This is separate from and orthogonal to the article's own
//     display category below — an admitted world-track item can still be
//     filed under any category (e.g. a major sport story stays 'sport').
import { config } from '../config.js';
import { extractFacts as llmExtractFacts } from '../llm/client.js';

const VALID_CATEGORIES = new Set(['hrvatska', 'zagreb', 'svijet', 'sport']);

/** Validate the LLM's classification; fall back sensibly if missing/invalid. */
function resolveCategory(rawCategory, track) {
  if (VALID_CATEGORIES.has(rawCategory)) return rawCategory;
  return track === 'world' ? 'svijet' : 'hrvatska';
}

/**
 * @param track 'hr' (Croatian portal) | 'world' (international wire) — the
 *   source's selection track.
 * @returns {Promise<{ facts: object, worldScore: number|null, isCurrentNews: boolean, category: string, passesGate: boolean }>}
 */
export async function extractFactsForItem({ title, bodyText, track }) {
  const facts = await llmExtractFacts({ title, bodyText, track });
  const isCurrentNews = facts.is_current_news !== false;
  const category = resolveCategory(facts.category, track);

  if (track !== 'world') {
    return { facts, worldScore: null, isCurrentNews, category, passesGate: isCurrentNews };
  }

  const raw = Number(facts.world_importance);
  const worldScore = Number.isFinite(raw) ? Math.max(0, Math.min(10, Math.round(raw))) : 0;
  const passesGate = isCurrentNews && worldScore >= config.selection.worldScoreThreshold;
  return { facts, worldScore, isCurrentNews, category, passesGate };
}
