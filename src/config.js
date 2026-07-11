// Central config, driven by environment (.env). All values have sane defaults
// so the app runs with zero configuration in stub mode.
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

const resolveFromRoot = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p));

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();

// If the requested mode's key is missing, fall back to stub rather than
// crashing at request time. This is what lets the whole pipeline run key-less.
const requestedMode = (process.env.LLM_MODE || 'stub').trim().toLowerCase();
let llmMode = 'stub';
if (requestedMode === 'live' && apiKey) llmMode = 'live';
else if (requestedMode === 'gemini' && geminiApiKey) llmMode = 'gemini';

export const config = {
  llm: {
    mode: llmMode, // 'stub' | 'live' (Anthropic) | 'gemini'
    apiKey,
    model: (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5').trim(),
    geminiApiKey,
    // Free-tier-friendly default. Verified against the live API - older
    // "flash-lite" models return 404/quota-0 for new accounts as Google
    // retires them, so re-check available models if this starts failing:
    // https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY
    geminiModel: (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite').trim(),
  },
  selection: {
    // World/EU items must score >= this (0-10) to be published (90/10 split).
    worldScoreThreshold: num(process.env.WORLD_SCORE_THRESHOLD, 7),
  },
  schedule: {
    ingestIntervalMin: num(process.env.INGEST_INTERVAL_MIN, 45),
  },
  paths: {
    db: resolveFromRoot(process.env.DB_PATH || './data/news.db'),
    publicDir: resolveFromRoot(process.env.PUBLIC_DIR || './public'),
  },
  server: {
    port: num(process.env.PORT, 4173),
  },
  ingest: {
    maxItemsPerSource: num(process.env.MAX_ITEMS_PER_SOURCE, 15),
    fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 15000),
    // Sent as User-Agent on outbound requests; be a polite citizen.
    userAgent:
      'NoClickbaitNewsAggregator/0.1 (+https://example.local; contact set in .env)',
  },
};

export default config;
