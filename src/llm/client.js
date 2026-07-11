// LLM dispatcher: exposes the two pipeline operations and routes each to either
// the deterministic stub (no key) or the live Anthropic API (LLM_MODE=live).
// Callers (pipeline/*) don't know or care which mode is active.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { factExtractionPrompt, summaryPrompt } from './prompts.js';
import { extractFactsStub, writeSummaryStub } from './stub.js';

let anthropic;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.llm.apiKey });
  return anthropic;
}

export function isLive() {
  return config.llm.mode === 'live';
}

/**
 * Call Anthropic with a system+user prompt and parse a single JSON object out
 * of the reply. Tolerates accidental code fences / surrounding prose.
 */
async function completeJson({ system, user, maxTokens }) {
  const res = await getAnthropic().messages.create({
    model: config.llm.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return parseJsonObject(text);
}

function parseJsonObject(text) {
  const fenced = text.replace(/```(?:json)?/gi, '');
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`LLM did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

/** LLM call 1 — extract structured facts (+ world importance) from body. */
export async function extractFacts({ title, bodyText, category }) {
  if (!isLive()) return extractFactsStub({ title, bodyText, category });
  const { system, user } = factExtractionPrompt({ title, bodyText, category });
  return completeJson({ system, user, maxTokens: 1500 });
}

/** LLM call 2 — write a plain summary from facts only. */
export async function writeSummary({ facts, sourceName, category }) {
  if (!isLive()) return writeSummaryStub({ facts, sourceName });
  const { system, user } = summaryPrompt({ facts, sourceName, category });
  return completeJson({ system, user, maxTokens: 1500 });
}
