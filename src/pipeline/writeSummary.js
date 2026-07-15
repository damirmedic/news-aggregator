// Step 5: LLM call 2 (write summary from facts only) + light sanitization so a
// malformed model reply can't produce an empty/oversized article row, plus the
// numeric-consistency hallucination guard (pipeline/verify.js): a summary that
// uses figures the facts don't support gets ONE corrective retry with the
// verifier's findings fed back, then the item is dropped — never published
// with an unverifiable number (automatic, no review queue, per CLAUDE.md).
import { writeSummary as llmWriteSummary, isLive } from '../llm/client.js';
import { verifySummary } from './verify.js';

const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();

function sanitize(out) {
  const headline = collapse(out.headline);
  const subheadline = collapse(out.subheadline);
  const body = (out.body || '').trim();
  // Non-content: a short English theme query for picking an illustrative stock
  // image (see prompts.js). Never rendered as text; only fed to resolveImage.
  const imageQuery = collapse(out.imageQuery);
  if (!headline || !body) {
    throw new Error('summary missing headline or body');
  }
  return { headline, subheadline, body, imageQuery };
}

/**
 * @returns {Promise<{ headline: string, subheadline: string, body: string }>}
 * @throws if the model returned no usable headline/body, or if the summary
 *   still fails numeric verification after the corrective retry.
 */
export async function writeSummaryForItem({ facts, sourceName, category }) {
  let summary = sanitize(await llmWriteSummary({ facts, sourceName, category }));
  if (!isLive()) return summary; // stub output is deterministic, not a model to police

  let problems = verifySummary(summary, facts);
  if (problems.length === 0) return summary;

  // One corrective rewrite with the verifier's findings spelled out. Logged
  // so the guard's firing rate (and what trips it) stays observable — that's
  // the data for tuning the whitelist/heuristics later.
  console.log(`[verify] summary rejected, retrying ("${summary.headline.slice(0, 60)}"): ${problems.join('; ')}`);
  summary = sanitize(
    await llmWriteSummary({ facts, sourceName, category, feedback: problems.join('\n') })
  );
  problems = verifySummary(summary, facts);
  if (problems.length > 0) {
    throw new Error(`hallucination-guard: ${problems.join('; ')}`);
  }
  return summary;
}
