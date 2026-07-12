// Prompt templates for the two-step, copyright-safe pipeline.
//
// Step 1 reads the article BODY and returns a structured fact-list, throwing
// away the original sentence structure. Step 2 sees ONLY those facts (never the
// original prose), which is what keeps the summary from mirroring the source.
// See "Content pipeline" and "Editorial style guide" in CLAUDE.md.

/**
 * Build the fact-extraction prompt (LLM call 1).
 * @param track 'hr' (Croatian portal) | 'world' (international wire) — the
 *   source's selection track, not the article's own display category (which
 *   this same call also classifies into "category" below).
 */
export function factExtractionPrompt({ title, bodyText, track }) {
  const system = [
    'You are a fact extractor for a news wire. You read one article and output',
    'a structured JSON list of the verifiable facts it contains. You never copy',
    'the article\'s sentence structure or wording — you extract facts only.',
    'Write every string value in Croatian (hrvatski), regardless of the',
    'article\'s source language — the output feeds a Croatian-language site.',
    'Output ONLY valid JSON, no prose, no code fences.',
  ].join(' ');

  const worldScoring =
    track === 'world'
      ? 'Also include "world_importance" (integer 0-10): how genuinely important ' +
        'this story is to a Croatian reader (major EU policy, war/conflict, global ' +
        'economy, natural disasters score high; routine wire coverage scores low).'
      : 'This came from a domestic Croatian portal; set "world_importance" to null.';

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
    '  "numbers": [string],    // key figures — see the numbers rule below',
    '  "quotes": [ { "text": string, "speaker": string } ], // <=15 words each, verbatim, attributable',
    '  "world_importance": number|null,',
    '  "is_current_news": boolean,',
    '  "category": "hrvatska" | "zagreb" | "svijet" | "sport"',
    '}',
    'Numbers rule: every entry in "numbers" MUST state the figure together with',
    'its unit AND what it refers to, exactly as the article states it — e.g.',
    '"450 glazbenika u projektu", "23 milijuna eura vrijednost škole", "2:1',
    'rezultat utakmice". NEVER output a bare number. The next processing step',
    'sees only your JSON, not the article, so a number without its referent',
    'will be misinterpreted.',
    'Extract ONLY what the article explicitly states. If you are not certain',
    'what a figure refers to, omit it entirely. Never infer, estimate, convert',
    'units, or combine figures. Omitting is always better than guessing.',
    worldScoring,
    'Set "is_current_news" to false for content that is not a report of a',
    'specific current event — historical retrospectives ("on this day",',
    'decades-old trivia narrated for its own sake, even about a once-newsworthy',
    'event), celebrity gossip, lifestyle/recipe/travel pieces, quizzes, or',
    'listicles. Set it to true for anything reporting something happening now,',
    'including a present-day commemoration or anniversary EVENT that is itself',
    'news (e.g. "today\'s memorial ceremony drew thousands") — the distinction',
    'is whether the article is about a current happening, not whether it',
    'mentions a past date.',
    '',
    'Classify "category" by the article\'s actual topic, regardless of which',
    'portal or feed it came from:',
    '  "sport"    — any sporting event, competition, athlete, or club, whether',
    '               Croatian or international. Takes priority whenever the',
    '               story is fundamentally about sport.',
    '  "zagreb"   — primarily about the city of Zagreb itself (its city',
    '               government, local events, local incidents) — not just',
    '               something that happens to be located there.',
    '  "svijet"   — international/world news not primarily about Croatia.',
    '  "hrvatska" — everything else: domestic Croatian national news.',
    'Do not invent facts. Omit anything not supported by the body.',
  ].join('\n');

  return { system, user };
}

/**
 * Build the summary-writing prompt (LLM call 2). Sees facts only.
 * @param category the article's own classified display category (from the
 *   fact-extraction step), used only as light context here — not the
 *   source's track.
 * @param feedback optional rejection notes from the numeric-consistency
 *   verifier (pipeline/verify.js) when a previous attempt invented or
 *   re-attached figures; triggers one corrective rewrite.
 */
export function summaryPrompt({ facts, sourceName, category, feedback }) {
  const system = [
    'You are an old-school wire-service reporter writing for a Croatian news',
    'site. From a structured fact-list (never any original article text), you',
    'write a plain, factual summary IN CROATIAN (hrvatski), always — the',
    'site\'s entire audience is Croatian, regardless of the story\'s origin or',
    'the language of the facts you were given.',
    'The fact-list is your ONLY source. You never add information that is not',
    'in it — no background knowledge, no assumptions, no invented detail.',
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
    'Write in Croatian (hrvatski) and return JSON:',
    '{',
    '  "headline": string,      // <= ~12 words; subject + verb + object; plain, no wordplay',
    '  "subheadline": string,   // one sentence; the second most important fact',
    '  "body": string           // inverted pyramid; plain reporting style; length rule below',
    '}',
    'STRICT RULES:',
    '- Use ONLY the facts above. Nothing else exists for this task.',
    '- Every number, date, name and quote in your output must appear in the',
    '  facts with the SAME meaning and unit. Copy figures exactly as given —',
    '  never round, convert, derive new figures, or attach a figure to a',
    '  different thing than the facts attach it to.',
    '- Length: up to ~400 words, and only as long as the facts support. If the',
    '  fact-list is thin, write a short summary — 80 accurate words beat 300',
    '  padded ones. NEVER pad with generalities or invented detail.',
    '- At most one short quoted fragment (<=15 words), verbatim from the facts.',
    '- Report severity plainly; never sensationalize.',
    ...(feedback
      ? [
          '',
          'YOUR PREVIOUS ATTEMPT WAS REJECTED by an automatic fact-checker:',
          feedback,
          'Rewrite the summary. Remove or correct every flagged figure; use',
          'figures ONLY exactly as they appear in the facts, attached to',
          'exactly what the facts attach them to.',
        ]
      : []),
  ].join('\n');

  return { system, user };
}
