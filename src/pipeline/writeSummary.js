// Step 5: LLM call 2 (write summary from facts only) + light sanitization so a
// malformed model reply can't produce an empty/oversized article row.
import { writeSummary as llmWriteSummary } from '../llm/client.js';

const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();

/**
 * @returns {Promise<{ headline: string, subheadline: string, body: string }>}
 * @throws if the model returned no usable headline or body.
 */
export async function writeSummaryForItem({ facts, sourceName, category }) {
  const out = await llmWriteSummary({ facts, sourceName, category });

  const headline = collapse(out.headline);
  const subheadline = collapse(out.subheadline);
  const body = (out.body || '').trim();

  if (!headline || !body) {
    throw new Error('summary missing headline or body');
  }
  return { headline, subheadline, body };
}
