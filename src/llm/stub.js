// Deterministic, offline stand-ins for the two LLM calls. Used whenever there
// is no ANTHROPIC_API_KEY (or LLM_MODE != live), so the full ingest -> publish
// cycle runs with no network and no cost.
//
// The output is intentionally plain and clearly marked as placeholder text so
// it can never be mistaken for real reporting. Determinism (seeded off the
// title) keeps runs reproducible and tests stable.

const STUB_MARK = '[STUB SUMMARY — no LLM key configured]';

/** Small deterministic hash so a title maps to a stable pseudo-score. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function firstSentence(text, fallback) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  const end = clean.search(/[.!?](\s|$)/);
  const s = end === -1 ? clean : clean.slice(0, end + 1);
  return s.length > 240 ? `${s.slice(0, 237)}...` : s;
}

/** Stand-in for LLM call 1: derive a minimal fact-list from title/body. */
export function extractFactsStub({ title, bodyText, category }) {
  // Deterministic 5-9 range so some world items pass and some don't at the
  // default threshold of 7 — exercises the 90/10 gate in stub runs.
  const worldImportance = category === 'world' ? 5 + (hash(title) % 5) : null;
  return {
    who: [],
    what: title.trim(),
    when: null,
    where: null,
    why: null,
    numbers: [],
    quotes: [],
    world_importance: worldImportance,
    _stub_excerpt: firstSentence(bodyText, title.trim()),
  };
}

/** Stand-in for LLM call 2: a plain placeholder summary built from the facts. */
export function writeSummaryStub({ facts, sourceName }) {
  const what = (facts.what || '').trim();
  const excerpt = facts._stub_excerpt || what;
  const headline = what.length > 90 ? `${what.slice(0, 87)}...` : what;

  const body = [
    STUB_MARK,
    '',
    `${excerpt}`,
    '',
    `This is placeholder text generated without a language model. When an ` +
      `Anthropic API key is configured (LLM_MODE=live), this space is replaced ` +
      `by a plain, factual summary written from extracted facts only. Reported ` +
      `by ${sourceName}.`,
  ].join('\n');

  return {
    headline: headline || 'Untitled item',
    subheadline: `Placeholder subheadline — source: ${sourceName}.`,
    body,
  };
}
