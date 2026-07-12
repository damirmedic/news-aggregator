// Cross-portal duplicate detection. With 11 Croatian portals active, the same
// real event (a match result, a policy announcement) routinely gets reported
// by several of them with different exact wording. Rather than an extra LLM
// call, this compares character-trigram overlap between a candidate's
// extracted facts and recently-published articles' headlines — cheap,
// deterministic, no network.
//
// Trigrams over whole-word tokens (not a word-exact match) deliberately,
// because Croatian's case system means the same word varies by ending
// depending on grammatical role — "Žilina" (nominative) vs "Žilinu"
// (accusative), "pretkolo" vs "pretkola"/"pretkolu" — so exact-token overlap
// under-counts obvious duplicates. Trigrams still share most of a word's
// substance across its different case forms.
import { normalize } from './filter.js';

// Croatian function words common enough to add noise, not signal, to overlap.
const STOPWORDS = new Set([
  'i', 'u', 'na', 'za', 'je', 'su', 'se', 'da', 'od', 'do', 'sa', 's', 'k',
  'ka', 'o', 'a', 'ali', 'ili', 'kao', 'koji', 'koja', 'koje', 'ne', 'bi',
  'ce', 'će', 'sam', 'si', 'smo', 'ste', 'nakon', 'prije', 'kod', 'iz', 'pod',
  'nad', 'kroz', 'preko', 'the', 'of', 'in', 'to', 'and', 'a',
]);

function contentWords(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Character trigrams over the filtered content words (joined with spaces). */
function trigrams(words) {
  const joined = words.join(' ');
  const grams = [];
  for (let i = 0; i <= joined.length - 3; i++) grams.push(joined.slice(i, i + 3));
  return grams;
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/** Signature for a candidate article, built from its extracted facts. */
export function factsSignature(facts) {
  const who = Array.isArray(facts.who) ? facts.who.join(' ') : '';
  return trigrams(contentWords(`${facts.what || ''} ${who}`));
}

/** Signature for an already-published article, built from its stored text. */
export function publishedSignature({ headline, subheadline }) {
  return trigrams(contentWords(`${headline || ''} ${subheadline || ''}`));
}

/**
 * @param signature tokens for the candidate (see factsSignature)
 * @param recent array of { tokens, headline } to compare against
 * @param threshold Jaccard similarity above which it's a duplicate
 * @returns the matching recent entry, or null
 */
export function findDuplicate(signature, recent, threshold) {
  if (signature.length === 0) return null;
  for (const entry of recent) {
    if (jaccardSimilarity(signature, entry.tokens) >= threshold) return entry;
  }
  return null;
}
