// LLM dispatcher: exposes the two pipeline operations and routes each to the
// deterministic stub (no key), the Gemini API (LLM_MODE=gemini — free tier),
// or the Anthropic API (LLM_MODE=live). Callers (pipeline/*) don't know or
// care which mode is active.
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { factExtractionPrompt, summaryPrompt } from './prompts.js';
import { extractFactsStub, writeSummaryStub } from './stub.js';

let anthropic;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: config.llm.apiKey });
  return anthropic;
}

let gemini;
function getGemini() {
  if (!gemini) gemini = new GoogleGenAI({ apiKey: config.llm.geminiApiKey });
  return gemini;
}

export function isLive() {
  return config.llm.mode !== 'stub';
}

/**
 * Call Anthropic with a system+user prompt and parse a single JSON object out
 * of the reply. Tolerates accidental code fences / surrounding prose.
 */
async function completeJsonAnthropic({ system, user, maxTokens, temperature }) {
  const res = await getAnthropic().messages.create({
    model: config.llm.model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return parseJsonObject(text);
}

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 3000;

const isRateLimitError = (err) =>
  err?.status === 429 || err?.code === 429 || /\b429\b/.test(String(err?.message ?? err));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call Gemini with a system+user prompt, requesting JSON output directly.
 * The free tier's per-minute request cap is easy to hit with many active
 * sources firing sequential calls, so 429s get a few exponential-backoff
 * retries before giving up — everything else fails immediately.
 */
async function completeJsonGemini({ system, user, temperature }) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await getGemini().models.generateContent({
        model: config.llm.geminiModel,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          temperature,
        },
      });
      return parseJsonObject(res.text);
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= RATE_LIMIT_RETRIES) throw err;
      await sleep(RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt);
    }
  }
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

async function completeJson({ system, user, temperature }) {
  if (config.llm.mode === 'gemini') return completeJsonGemini({ system, user, temperature });
  return completeJsonAnthropic({ system, user, maxTokens: 1500, temperature });
}

// Low temperatures on purpose — both calls are transcription-shaped, not
// creative, and sampling randomness is a direct hallucination vector here.
// Extraction is fully greedy (0); the writer gets a whisper of variation (0.2)
// so retried summaries don't reproduce the exact rejected output.
const EXTRACT_TEMPERATURE = 0;
const SUMMARY_TEMPERATURE = 0.2;

/** LLM call 1 — extract structured facts (+ world importance, category) from body. */
export async function extractFacts({ title, bodyText, track }) {
  if (!isLive()) return extractFactsStub({ title, bodyText, track });
  const { system, user } = factExtractionPrompt({ title, bodyText, track });
  return completeJson({ system, user, temperature: EXTRACT_TEMPERATURE });
}

/**
 * LLM call 2 — write a plain summary from facts only. `feedback` carries
 * verifier rejection notes for the single corrective retry (see
 * pipeline/writeSummary.js).
 */
export async function writeSummary({ facts, sourceName, category, feedback }) {
  if (!isLive()) return writeSummaryStub({ facts, sourceName });
  const { system, user } = summaryPrompt({ facts, sourceName, category, feedback });
  return completeJson({ system, user, temperature: SUMMARY_TEMPERATURE });
}
