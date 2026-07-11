// Step 4: LLM call 1 (extract facts) + the 90/10 world-importance gate.
// For 'world' items we only proceed if the returned importance score clears
// WORLD_SCORE_THRESHOLD. Domestic 'hr' items always pass this step.
import { config } from '../config.js';
import { extractFacts as llmExtractFacts } from '../llm/client.js';

/**
 * @returns {Promise<{ facts: object, worldScore: number|null, passesGate: boolean }>}
 */
export async function extractFactsForItem({ title, bodyText, category }) {
  const facts = await llmExtractFacts({ title, bodyText, category });

  if (category !== 'world') {
    return { facts, worldScore: null, passesGate: true };
  }

  const raw = Number(facts.world_importance);
  const worldScore = Number.isFinite(raw) ? Math.max(0, Math.min(10, Math.round(raw))) : 0;
  const passesGate = worldScore >= config.selection.worldScoreThreshold;
  return { facts, worldScore, passesGate };
}
