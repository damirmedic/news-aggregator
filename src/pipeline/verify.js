// Hallucination guard: deterministic numeric-consistency checks between the
// pipeline's three text layers (source article -> extracted facts -> written
// summary). Prompt instructions reduce invention; this module is the
// mechanical backstop for the failure class we can actually verify without
// another LLM call: NUMBERS.
//
// Numbers are the sweet spot because they're language-invariant — "450"
// survives Croatian declension, English->Croatian translation, and rewording,
// so a figure in a summary either traces back to the facts it was written
// from, or it was invented. Two checks:
//
//   1. Presence: every numeric token in the summary must appear in the facts;
//      every numeric token in the facts must appear in the source article.
//      Catches invented figures outright.
//   2. Unit adjacency: the word immediately after a number in the summary must
//      also occur in the facts. Catches the subtler re-attachment failure —
//      the observed real case was a source's "450 musicians" becoming the
//      summary's "450-minute album": "450" passes the presence check, but
//      "minuta" appears nowhere in the facts, so adjacency flags it.
//
// On violation the caller retries the summary once with explicit feedback,
// then drops the item (automatic, no human review queue — per CLAUDE.md).
// Croatian morphology (glazbenika/glazbenici/glazbenicima) is handled with
// rough stemming + prefix matching; a small whitelist covers date/time words
// that legitimately follow numbers without appearing in the facts verbatim.
import { normalize } from './filter.js';

// Words that may follow a number without appearing in the facts: months
// (genitive), clock/duration-of-day and age phrasing, i.e. "12. srpnja",
// "u 20 sati", "u 71. godini", "41-godišnjak". Deliberately NOT whitelisted:
// "minuta", "posto", currencies — those carry contentful meaning and must be
// supported by the facts (whitelisting "minuta" would readmit the observed
// 450-minute hallucination).
const ADJACENT_WHITELIST_PREFIXES = [
  'sijecnj', 'veljac', 'ozujk', 'travnj', 'svibnj', 'lipnj',
  'srpnj', 'kolovoz', 'rujn', 'listopad', 'studen', 'prosinc',
  'sat', 'godi', 'h',
];

/** Rough Croatian stem: strip trailing vowels (see dedupe.js for rationale). */
function stem(word) {
  let w = word;
  while (w.length > 4 && 'aeiou'.includes(w[w.length - 1])) w = w.slice(0, -1);
  return w;
}

/**
 * Canonical numeric tokens of a text. "9.954" / "9,954" / "9954" all become
 * "9954" (Croatian thousands separators); score-like "2:1" and clock-like
 * "22:00" keep their colon so they don't collapse into unrelated integers.
 */
export function numericTokens(text) {
  const out = new Set();
  for (const m of String(text ?? '').match(/\d[\d.,:]*/g) || []) {
    const token = m.replace(/[.,]+$/, '').replace(/(\d)[.,](?=\d)/g, '$1');
    if (token) out.add(token);
  }
  return out;
}

const isYear = (t) => /^(?:19|20)\d\d$/.test(t);

// dd.mm. / dd.mm.yyyy numeric dates. Exempt from both checks: a truncated
// date ("12.7.") and a full one ("12.7.2026.") canonicalize to different
// tokens, and the word following a date is arbitrary prose, not a unit.
// Croatian thousands separators ("9.954") have a 3-digit tail and don't
// match, so real magnitudes stay checked.
const isDateLike = (t) => /^\d{1,2}\.\d{1,2}(\.\d{2,4})?\.?$/.test(t);

/** Flatten a facts object's content fields to one searchable string. */
export function factsText(facts, { includeWhen = true } = {}) {
  const parts = [
    ...(Array.isArray(facts.who) ? facts.who : []),
    facts.what,
    includeWhen ? facts.when : null,
    facts.where,
    facts.why,
    ...(Array.isArray(facts.numbers) ? facts.numbers : []),
    ...(Array.isArray(facts.quotes) ? facts.quotes : []).flatMap((q) => [q?.text, q?.speaker]),
  ];
  return parts.filter(Boolean).join('\n');
}

/**
 * Numeric tokens present in `childText` but absent from `parentText`.
 * `exemptYears` skips 19xx/20xx (dates get legitimately resolved from feed
 * context, e.g. "danas" -> "12. srpnja 2026."); single digits are always
 * exempt (too often spelled out in prose: "dvije" -> "2").
 */
export function findUnsupportedNumbers(childText, parentText, { exemptYears = false } = {}) {
  const parent = numericTokens(parentText);
  const problems = [];
  for (const m of String(childText ?? '').match(/\d[\d.,:]*/g) || []) {
    const raw = m.replace(/[.,]+$/, '');
    if (isDateLike(raw)) continue;
    const token = raw.replace(/(\d)[.,](?=\d)/g, '$1');
    if (token.length < 2) continue;
    if (exemptYears && isYear(token)) continue;
    if (!parent.has(token)) problems.push(token);
  }
  return problems;
}

/** Do two stems plausibly refer to the same word family? */
function stemsMatch(a, b) {
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // Palatalization etc. can flip a late consonant (glazbenik/glazbenic-);
  // a shared 5-char prefix is close enough for this guard's purposes.
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/**
 * Numbers in `summaryText` whose immediately following word does not occur in
 * the facts — i.e. a figure re-attached to a unit/referent the facts never
 * stated ("450 glazbenika" -> "450 minuta").
 *
 * Runs on the RAW text and only accepts a lowercase following word: after a
 * sentence-final number, the next sentence starts capitalized ("...iznosi
 * 660. Policija je...") and must not be mistaken for that number's unit.
 * Units and Croatian month names are lowercase, so real referents match.
 */
export function findUnitMismatches(summaryText, factsStr) {
  const factsStems = new Set(
    normalize(factsStr)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3)
      .map(stem)
  );
  const problems = [];
  for (const m of String(summaryText ?? '').matchAll(/(\d[\d.,:]*)[\s.-]*([a-zčćžšđ][a-zčćžšđA-ZČĆŽŠĐ]{2,})/g)) {
    const [, num, word] = m;
    // Observed live false positive: "...objavljena 12.7. koristi se..." —
    // the word after a numeric date is prose, not the figure's unit.
    if (isDateLike(num)) continue;
    const w = stem(normalize(word));
    if (w.length < 3) continue;
    if (ADJACENT_WHITELIST_PREFIXES.some((p) => w.startsWith(p))) continue;
    if ([...factsStems].some((f) => stemsMatch(f, w))) continue;
    problems.push(`${num} ${word}`);
  }
  return problems;
}

// Croatian numeric qualifiers (normalized forms). "više od 2700" and "2700"
// are different claims — dropping, adding, or swapping one is a fabrication
// even though the figure itself checks out.
const QUALIFIER_RE =
  /(?:\b(vise od|manje od|preko|gotovo|oko|najmanje|najvise|priblizno|skoro|barem)\s+)?(\d[\d.,:]*)/g;

/** All numeric occurrences of `text` as { token, qualifier|null } pairs. */
function qualifiedOccurrences(text) {
  const out = [];
  for (const m of normalize(text).matchAll(QUALIFIER_RE)) {
    const [, qualifier, num] = m;
    const raw = num.replace(/[.,]+$/, '');
    if (isDateLike(raw)) continue;
    const token = raw.replace(/(\d)[.,](?=\d)/g, '$1');
    if (token.length < 2) continue;
    out.push({ token, qualifier: qualifier || null });
  }
  return out;
}

/**
 * Figures whose qualifier differs between summary and facts — e.g. facts say
 * "više od 2700" but the summary states a flat "2700" (or vice versa). A
 * summary occurrence passes if ANY facts occurrence of the same figure
 * carries the same qualifier (including none).
 */
export function findQualifierMismatches(summaryText, factsStr) {
  const factsQualifiers = new Map();
  for (const { token, qualifier } of qualifiedOccurrences(factsStr)) {
    if (!factsQualifiers.has(token)) factsQualifiers.set(token, new Set());
    factsQualifiers.get(token).add(qualifier);
  }
  const problems = [];
  for (const { token, qualifier } of qualifiedOccurrences(summaryText)) {
    const allowed = factsQualifiers.get(token);
    if (!allowed) continue; // absent figure — the presence check owns that
    if (!allowed.has(qualifier)) {
      const said = qualifier ? `"${qualifier} ${token}"` : `a flat "${token}"`;
      const expected = [...allowed].map((q) => (q ? `"${q} ${token}"` : `a flat "${token}"`)).join(' or ');
      problems.push(`summary says ${said} but the facts say ${expected}`);
    }
  }
  return problems;
}

/**
 * Verify a written summary against the facts it was generated from.
 * @returns {string[]} human-readable problems; empty = clean.
 */
export function verifySummary({ headline, subheadline, body }, facts) {
  const summaryText = [headline, subheadline, body].filter(Boolean).join('\n');
  const factsStr = factsText(facts, { includeWhen: true });
  const problems = [];
  const invented = findUnsupportedNumbers(summaryText, factsStr, { exemptYears: true });
  if (invented.length) {
    problems.push(`figures not present in the facts: ${invented.join(', ')}`);
  }
  for (const pair of findUnitMismatches(summaryText, factsStr)) {
    problems.push(`figure attached to a unit/referent the facts never mention: "${pair}"`);
  }
  problems.push(...findQualifierMismatches(summaryText, factsStr));
  return problems;
}

/**
 * Verify extracted facts against the source article. Unsupported figures in
 * the auxiliary `numbers` array are silently dropped (self-healing); an
 * unsupported figure in a core field (what/why/where/quotes) rejects the item.
 * `when` is exempt — resolving "danas" to a date is legitimate, not invention.
 * @returns {{ facts: object, problems: string[] }}
 */
export function verifyFacts(facts, sourceText) {
  const cleaned = { ...facts };
  if (Array.isArray(facts.numbers)) {
    cleaned.numbers = facts.numbers.filter(
      (n) => findUnsupportedNumbers(String(n), sourceText, { exemptYears: true }).length === 0
    );
  }
  const core = factsText({ ...cleaned, when: null }, { includeWhen: false });
  const invented = findUnsupportedNumbers(core, sourceText, { exemptYears: true });
  const problems = invented.length
    ? [`extracted figures not present in the source: ${invented.join(', ')}`]
    : [];
  return { facts: cleaned, problems };
}
