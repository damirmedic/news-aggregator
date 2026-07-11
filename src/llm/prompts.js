// Prompt templates for the two-step, copyright-safe pipeline.
//
// Step 1 reads the article BODY and returns a structured fact-list, throwing
// away the original sentence structure. Step 2 sees ONLY those facts (never the
// original prose), which is what keeps the summary from mirroring the source.
// See "Content pipeline" and "Editorial style guide" in CLAUDE.md.

/** Build the fact-extraction prompt (LLM call 1). */
export function factExtractionPrompt({ title, bodyText, category }) {
  const system = [
    'You are a fact extractor for a news wire. You read one article and output',
    'a structured JSON list of the verifiable facts it contains. You never copy',
    'the article\'s sentence structure or wording — you extract facts only.',
    'Output ONLY valid JSON, no prose, no code fences.',
  ].join(' ');

  const worldScoring =
    category === 'world'
      ? 'Also include "world_importance" (integer 0-10): how genuinely important ' +
        'this story is to a Croatian reader (major EU policy, war/conflict, global ' +
        'economy, natural disasters score high; routine wire coverage scores low).'
      : 'This is a domestic Croatian story; set "world_importance" to null.';

  const user = [
    `SOURCE TITLE: ${title}`,
    '',
    'ARTICLE BODY:',
    bodyText,
    '',
    'Return JSON with exactly these keys:',
    '{',
    '  "who": [string],        // people/organizations involved',
    '  "what": string,         // the core event, plainly stated',
    '  "when": string|null,    // time/date of the event',
    '  "where": string|null,   // location',
    '  "why": string|null,     // cause / significance, if stated',
    '  "numbers": [string],    // key figures (amounts, counts, dates)',
    '  "quotes": [ { "text": string, "speaker": string } ], // <=15 words each, verbatim, attributable',
    '  "world_importance": number|null',
    '}',
    worldScoring,
    'Do not invent facts. Omit anything not supported by the body.',
  ].join('\n');

  return { system, user };
}

/** Build the summary-writing prompt (LLM call 2). Sees facts only. */
export function summaryPrompt({ facts, sourceName, category }) {
  const system = [
    'You are an old-school wire-service reporter. From a structured fact-list',
    '(never any original article text), you write a plain, factual summary.',
    'No clickbait, no rhetorical questions, no emotional or sensational framing,',
    'no speculation, no editorializing. Inverted pyramid: most important first.',
    'Output ONLY valid JSON, no prose, no code fences.',
  ].join(' ');

  const user = [
    `SOURCE: ${sourceName} (${category})`,
    '',
    'FACTS (JSON):',
    JSON.stringify(facts, null, 2),
    '',
    'Write, in the same language as the facts, and return JSON:',
    '{',
    '  "headline": string,      // <= ~12 words; subject + verb + object; plain, no wordplay',
    '  "subheadline": string,   // one sentence; the second most important fact',
    '  "body": string           // 200-500 words; inverted pyramid; plain reporting style',
    '}',
    'At most one short quoted fragment (<=15 words). Report severity plainly; never sensationalize.',
  ].join('\n');

  return { system, user };
}
