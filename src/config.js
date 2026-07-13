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
  freshness: {
    // Feed items older than this (by the source's own pubDate) are filtered
    // before the expensive full-text + LLM steps. Default 3h: the deployed
    // GitHub Actions "hourly" cron is best-effort and in practice skips/delays
    // runs (observed running every 2-4h overnight), so a 1h window turned every
    // skipped hour into a permanent coverage gap. 3h lets a delayed/missed run
    // still pick up what it dropped. URL-dedupe guarantees nothing is processed
    // twice, so the only cost of a wider window is "freshest ~3h" vs "1h".
    maxAgeHours: num(process.env.FETCH_MAX_AGE_HOURS, 3),
    // How long a published article stays on the live site (front page +
    // detail page). The DB row itself is kept indefinitely (cheap, useful
    // for future search/history features) — this only bounds what
    // generateSite() renders.
    articleRetentionDays: num(process.env.ARTICLE_RETENTION_DAYS, 7),
  },
  dedupe: {
    // How far back to compare new articles against for cross-portal
    // duplicate detection (the same event reported by several portals).
    windowHours: num(process.env.DEDUPE_WINDOW_HOURS, 48),
    // Weighted-Jaccard threshold (entities + numbers + event trigrams; see
    // pipeline/dedupe.js) above which two articles are treated as the same
    // story and the later one dropped. Shared named entities/numbers dominate
    // the score, so genuine cross-portal matches land well above unrelated
    // stories that merely share a place or an institution. Tune if it
    // over/under-fires.
    similarityThreshold: num(process.env.DEDUPE_SIMILARITY_THRESHOLD, 0.24),
  },
  schedule: {
    // Default 60 -> the scheduler runs hourly at the top of each hour.
    ingestIntervalMin: num(process.env.INGEST_INTERVAL_MIN, 60),
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
    // Max LLM calls per ingest run (~2 per article: facts + summary). This
    // rations the Gemini free tier's HARD DAILY cap (500 requests/day for
    // flash-lite) across the whole day: without it, the morning's news volume
    // exhausts the quota by midday and every evening run publishes nothing
    // (observed live: 161 articles by 11:30 UTC, then a wall of daily-quota
    // 429s). 18 × ~24-29 runs/day ≈ 430-520 attempts — items over budget stay
    // 'new' and roll to the next run, newest first, until the freshness
    // window ages them out.
    llmCallBudget: num(process.env.LLM_CALLS_PER_RUN, 18),
    fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 15000),
    // Sent as User-Agent on outbound requests; be a polite citizen.
    userAgent:
      'NoClickbaitNewsAggregator/0.1 (+https://example.local; contact set in .env)',
  },
};

export default config;
