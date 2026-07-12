// Cross-portal duplicate detection. With ~11 Croatian portals active, the same
// real event (a match result, a wildfire, a fatal incident) routinely gets
// reported by several of them within the same hour, worded differently. This
// collapses those into one published article — deterministically, with no
// extra LLM call.
//
// The signal is NOT lexical similarity of the two summaries: each portal's
// article is independently summarized, so even the same event yields quite
// different wording. What's stable across portals is the *facts* the extractor
// already isolates — the named entities (who/where), the key numbers, and the
// core event. So a signature is built from those, and two articles are scored
// by a weighted Jaccard where shared entities and numbers count far more than
// shared event wording:
//
//   score = ( wE·|E∩| + wN·|N∩| + wG·|G∩| ) / ( wE·|E∪| + wN·|N∪| + wG·|G∪| )
//
//   E = entity stems from who/where (proper nouns; declension-stemmed)
//   N = key numbers (ages, scores, amounts, counts — years excluded)
//   G = character trigrams of the core event text ("what")
//
// Entities/numbers carry the identity of a story ("Norveška", "41", "Korčula");
// the event trigrams provide fuzzy backing and separate two stories that share
// only a generic place. Croatian case declension ("Norveška"/"Norvešku",
// "Korčula"/"Korčule") is handled by stemming entities and by trigrams, both of
// which are robust to changing word endings.
import { normalize } from './filter.js';

// Relative weights of the three feature spaces. Entities and numbers are the
// discriminative signal; event wording is supporting evidence.
const W_ENTITY = 3;
const W_NUMBER = 3;
const W_GRAM = 1;

// Entities so common across domestic news that sharing them says nothing about
// two articles being the same story — every government/police item mentions
// some of these. Dropping them is what stops two *different* government
// decisions (both "Vlada Republike Hrvatske") from being merged: with these
// gone, such stories share no entities and fall back to (differing) event text.
const GENERIC_ENTITY_STEMS = new Set([
  'hrvatsk', 'republik', 'vlad', 'ministarstv', 'ministar', 'sabor', 'mup',
  'policij', 'drzav', 'zupanij', 'opcin', 'europsk', 'unij', 'hrvat',
]);

// Croatian function words — noise, not signal, in the event-text trigrams.
const STOPWORDS = new Set([
  'i', 'u', 'na', 'za', 'je', 'su', 'se', 'da', 'od', 'do', 'sa', 's', 'k',
  'ka', 'o', 'a', 'ali', 'ili', 'kao', 'koji', 'koja', 'koje', 'ne', 'bi',
  'ce', 'će', 'sam', 'si', 'smo', 'ste', 'nakon', 'prije', 'kod', 'iz', 'pod',
  'nad', 'kroz', 'preko', 'the', 'of', 'in', 'to', 'and',
]);

/**
 * Reduce a normalized word to a rough stem by dropping trailing vowels — the
 * most common Croatian case endings (Norveška/Norvešku → norvesk, Korčula/
 * Korčule/Korčuli → korcul, Engleska/Englesku → englesk). Consonant-mutation
 * cases are left to the trigram backing.
 */
function stem(word) {
  let w = word;
  while (w.length > 4 && 'aeiou'.includes(w[w.length - 1])) w = w.slice(0, -1);
  return w;
}

/** Significant content words of `text` (normalized, stopworded, len > 2). */
function contentWords(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Character-trigram set of an already-normalized, space-joined word string. */
function gramSet(joined) {
  const set = new Set();
  for (let i = 0; i <= joined.length - 3; i++) set.add(joined.slice(i, i + 3));
  return set;
}

/**
 * Proper-noun stems in `strings`. A word counts as an entity if it's
 * capitalized (proper noun) and not a generic institution. When `skipFirst`,
 * the first word of each string is ignored — used for sentence-like text
 * ("what") whose first word is capitalized only because it starts a sentence.
 */
function entityStems(strings, { skipFirst = false } = {}) {
  const ents = new Set();
  for (const s of strings) {
    if (!s) continue;
    const words = String(s).split(/\s+/);
    words.forEach((raw, i) => {
      if (skipFirst && i === 0) return;
      const clean = raw.replace(/[^\p{L}\p{N}]/gu, '');
      if (clean.length < 3) return;
      const first = clean[0];
      const isCapitalized = first === first.toUpperCase() && first !== first.toLowerCase();
      if (!isCapitalized) return;
      const st = stem(normalize(clean));
      if (st.length >= 3 && !GENERIC_ENTITY_STEMS.has(st)) ents.add(st);
    });
  }
  return [...ents];
}

/** Key numbers: ages, scores, amounts, counts. Years and lone digits dropped. */
function numberTokens(facts) {
  const parts = [];
  if (Array.isArray(facts.numbers)) parts.push(...facts.numbers.map(String));
  if (facts.what) parts.push(String(facts.what));
  const text = parts.join(' ').replace(/(\d)[.\s](\d{3})(?!\d)/g, '$1$2'); // 8.372 -> 8372
  const out = new Set();
  for (const m of text.match(/\d+(?::\d+)?/g) || []) {
    if (m.length < 2) continue; // lone digit: too generic
    if (/^(?:19|20)\d\d$/.test(m)) continue; // a year: too common to discriminate
    out.add(m);
  }
  return [...out];
}

/**
 * Build a duplicate-detection signature from an article's extracted facts.
 * Serializable (plain arrays + a string) so it can be stored on the article row
 * and compared symmetrically against future candidates.
 * @returns {{ e: string[], n: string[], w: string }}
 */
export function buildSignature(facts) {
  const whoWhere = [
    ...(Array.isArray(facts.who) ? facts.who : []),
    ...(facts.where ? [facts.where] : []),
  ];
  const e = new Set([
    ...entityStems(whoWhere),
    ...entityStems(facts.what ? [facts.what] : [], { skipFirst: true }),
  ]);
  return {
    e: [...e],
    n: numberTokens(facts),
    w: contentWords(facts.what || '').join(' '),
  };
}

function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return { inter, union: a.size + b.size - inter };
}

/** Weighted-Jaccard similarity (0-1) between two signatures. */
export function similarity(a, b) {
  const e = jaccard(new Set(a.e), new Set(b.e));
  const n = jaccard(new Set(a.n), new Set(b.n));
  const g = jaccard(a._g || (a._g = gramSet(a.w)), b._g || (b._g = gramSet(b.w)));
  const num = W_ENTITY * e.inter + W_NUMBER * n.inter + W_GRAM * g.inter;
  const den = W_ENTITY * e.union + W_NUMBER * n.union + W_GRAM * g.union;
  return den === 0 ? 0 : num / den;
}

/** True if a signature carries no usable signal at all. */
function isEmpty(sig) {
  return !sig || (sig.e.length === 0 && sig.n.length === 0 && sig.w === '');
}

/**
 * Find the most similar recent article at or above `threshold`.
 * @param sig       the candidate's signature (see buildSignature)
 * @param recent    array of { sig, headline } already-published articles
 * @param threshold weighted-Jaccard similarity above which it's a duplicate
 * @returns the best-matching recent entry, or null
 */
export function findDuplicate(sig, recent, threshold) {
  if (isEmpty(sig)) return null;
  let best = null;
  let bestScore = -1;
  for (const entry of recent) {
    if (!entry.sig) continue;
    const score = similarity(sig, entry.sig);
    if (score >= threshold && score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}
