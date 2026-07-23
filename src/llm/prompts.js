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
    '  "who": [string],        // ACTORS in the event — see the who rule below',
    '  "what": string,         // the core event, plainly stated',
    '  "when": string|null,    // when the EVENT happened — NOT the publish time; see rule',
    '  "where": string|null,   // location',
    '  "why": string|null,     // cause / significance, if stated',
    '  "numbers": [string],    // key figures — see the numbers rule below',
    '  "background": [string], // contextual mentions — see the background rule below',
    '  "quotes": [ { "text": string, "speaker": string } ], // <=15 words each, verbatim, attributable',
    '  "world_importance": number|null,',
    '  "is_current_news": boolean,',
    '  "category": "hrvatska" | "zagreb" | "svijet" | "sport"',
    '}',
    'Who rule: every entry in "who" MUST be the name PLUS that person\'s/',
    'organization\'s stated role or connection to the event, exactly as the',
    'article states it — e.g. "Kylian Mbappé — vodeći strijelac prvenstva",',
    'never a bare "Kylian Mbappé". Include ONLY actors in the event itself.',
    'Background rule: people, records, or past events the article mentions',
    'only as context or comparison (historical figures, all-time lists,',
    'similar past cases) go in "background", NOT in "who" — each entry with',
    'its stated context, e.g. "Pelé i Diego Maradona spominju se na vječnoj',
    'listi najboljih strijelaca SP-a". A name without its stated context is',
    'useless to the next step and will be misattributed.',
    'Numbers rule: every entry in "numbers" MUST state the figure together with',
    'its unit AND what it refers to, exactly as the article states it — e.g.',
    '"450 glazbenika u projektu", "23 milijuna eura vrijednost škole", "2:1',
    'rezultat utakmice". NEVER output a bare number. Keep the article\'s own',
    'qualifiers attached to the figure ("više od 2700", "oko 30", "najmanje',
    '5") — "više od 2700" and "2700" are different claims. The next processing',
    'step sees only your JSON, not the article, so a number without its',
    'referent and qualifiers will be misinterpreted.',
    'Context rule: "what" must carry the event\'s stated framing — for a match,',
    'WHICH competition the article says it belongs to; for an incident, what',
    'kind the article says it was. Copy that framing from the article; if the',
    'article does not state it, leave it unstated rather than guessing.',
    'Time/place rule: bind every date, time, and venue to the SPECIFIC event it',
    'belongs to, inside the string — the next step sees only your JSON and will',
    'otherwise attach a stray time or place to the wrong event.',
    '  - Never output a bare clock time: a time without its day ("u 21 sat") is',
    '    meaningless and gets read as "today". Write "finale u subotu u 21 sat",',
    '    or add "(datum nije naveden)" if the article gives the time but not the',
    '    day.',
    '  - Never output a bare venue: say which event happens there, and for a',
    '    match keep home/away and WHICH LEG exactly as stated — e.g. "uzvratnu',
    '    utakmicu Hajduk igra u gostima kod Žiline; prva odigrana na Poljudu",',
    '    not just "Poljud".',
    '  - When two events differ in time or place (finale vs. utakmica za 3.',
    '    mjesto; prva vs. uzvratna utakmica), keep each one\'s time and venue',
    '    bound to it — never collapse them or let one event\'s venue/time attach',
    '    to the other.',
    'Publication-time rule: the article\'s own publish/update timestamp is NOT',
    'the event time — never record it in "when" (or anywhere else). This is the',
    'byline/dateline stamp, an "objavljeno"/"ažurirano" time, or a bare',
    'minute-precise clock time that just marks when the piece was posted. Record',
    '"when" ONLY when the article explicitly says when the EVENT itself happened,',
    'described in event terms ("u nedjelju navečer", "oko 9 ujutro", "sinoć").',
    'Watch the giveaway: a to-the-minute time like "u 23:25" or "u 09:29 sati",',
    'especially one that matches when the article was posted, is a publication',
    'timestamp — if that is the only time in the article, set "when" to null',
    'rather than passing it on as if the event happened then.',
    'Result rule: if the article reports a match, game, or contest that has been',
    'PLAYED, its result is a REQUIRED fact. Put the final score in "numbers"',
    'with its referent, exactly as the source states it — e.g. "0:0 konačni',
    'rezultat utakmice" — and state the outcome in "what". A scoreless or',
    'goalless draw ("0:0", "bez pogodaka") IS a result: never drop it because it',
    'is zeros. A report of a played match with no result is incomplete and makes',
    'no sense to the reader. (If the match has not been played yet — a preview —',
    'there is naturally no result; do not invent one.)',
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
    '  "body": string,          // inverted pyramid; plain reporting style; length rule below',
    '  "imageQuery": string     // see IMAGE QUERY below',
    '}',
    'STRICT RULES:',
    '- Use ONLY the facts above. Nothing else exists for this task.',
    '- Every number, date, name and quote in your output must appear in the',
    '  facts with the SAME meaning and unit. Copy figures exactly as given —',
    '  never round, convert, derive new figures, or attach a figure to a',
    '  different thing than the facts attach it to.',
    '- Copy numeric qualifiers exactly: "više od 2700" must stay "više od',
    '  2700" — never "2700", "oko 2700", or "gotovo 3000". Dropping or adding',
    '  a qualifier changes the claim.',
    '- NEVER add a categorical label the facts do not state: what type of',
    '  event something was, which competition a match belongs to, a cause, a',
    '  legal status. If the facts say only "utakmica", write "utakmica" — not',
    '  "pripremna utakmica" or "kvalifikacijska utakmica". A plausible guess',
    '  that fills a gap is a fabrication; an unqualified statement is correct.',
    '- Mention every person/organization ONLY in the role or relationship the',
    '  facts state for them. Never move a name to a different list, group, or',
    '  role: if the facts say two players "spominju se na vječnoj listi',
    '  najboljih strijelaca", writing "na popisu sudionika" is a fabrication.',
    '  If the facts give someone no stated connection, omit them entirely.',
    '- Items in "background" are context, NOT participants in the event. Use',
    '  each one only together with its stated context, or leave it out.',
    '- When the facts do not state how two things are connected, report them',
    '  as separate statements — do not invent the connection.',
    '- Never place an event at a location unless the facts bind that location to',
    '  THAT event. For a match, keep home/away and which leg exactly as stated:',
    '  if the facts say the return leg is away and a stadium is tied only to the',
    '  already-played first leg, do NOT write that the team plays the return leg',
    '  at that stadium.',
    '- Never state a time or kickoff without the day the facts attach to it. A',
    '  bare "u 21 sat" reads as today and misleads — include the date from the',
    '  facts, or omit the standalone time. A schedule needs its day too.',
    '- Never present a date/time as when the event happened unless the facts',
    '  state it AS the event\'s time. Do not turn a bare, to-the-minute timestamp',
    '  (e.g. "u 23:25", "u 09:29 sati") into "dogodilo se u ..." — that is almost',
    '  always the article\'s publish time, not the event\'s. When in doubt, omit',
    '  it rather than assert when the event occurred.',
    '- If the facts report a match/game/contest that was PLAYED and give its',
    '  result, you MUST state that result — including a scoreless draw ("0:0").',
    '  A report of a played match that omits the outcome makes no sense. (Never',
    '  invent a result the facts do not contain; this applies only when they do.)',
    '- Traceability test: every sentence you write must restate specific facts',
    '  from the list. If you cannot point to the fact a sentence came from,',
    '  delete that sentence.',
    '- Length: up to ~400 words, and only as long as the facts support. If the',
    '  fact-list is thin, write a short summary — 80 accurate words beat 300',
    '  padded ones. NEVER pad with generalities or invented detail.',
    '- At most one short quoted fragment (<=15 words), verbatim from the facts.',
    '- Report severity plainly; never sensationalize.',
    'IMAGE QUERY (imageQuery):',
    '- 2-4 GENERIC English keywords naming the general visual THEME of the story',
    '  — a place, object, setting, or activity — for picking a decorative stock',
    '  photo. Examples: "Croatian parliament building", "wildfire coast",',
    '  "football stadium night", "flooded street".',
    '- This is NOT article content and is never shown to readers, so it is the',
    '  ONE place you may generalize: describe the scene type, do not name',
    '  specific people, teams, or brands (no free stock photo will match them).',
    '  Stay faithful to the topic; do not invent a scene the facts contradict.',
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
