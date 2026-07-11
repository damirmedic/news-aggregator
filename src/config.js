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

// If there's no key we can't talk to Anthropic, so force stub mode regardless
// of what LLM_MODE says. This is what lets the whole pipeline run key-less.
const requestedMode = (process.env.LLM_MODE || 'stub').trim().toLowerCase();
const llmMode = apiKey && requestedMode === 'live' ? 'live' : 'stub';

export const config = {
  llm: {
    mode: llmMode, // 'stub' | 'live'
    apiKey,
    model: (process.env.ANTHROPIC_MODEL || 'claude-sonnet-5').trim(),
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
