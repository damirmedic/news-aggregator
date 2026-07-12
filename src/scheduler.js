// Cron scheduler (`npm start`). Runs an ingestion cycle immediately, then every
// INGEST_INTERVAL_MIN minutes. Overlap-guarded so a slow run can't stack.
import cron from 'node-cron';
import { config } from './config.js';
import { runIngestCycle } from './pipeline/run.js';

let running = false;

async function tick({ offline }) {
  if (running) {
    console.log('[scheduler] previous run still in progress; skipping this tick');
    return;
  }
  running = true;
  try {
    await runIngestCycle({ offline });
  } catch (err) {
    console.error('[scheduler] ingest cycle failed:', err);
  } finally {
    running = false;
  }
}

export function startScheduler({ offline = false } = {}) {
  const min = Math.max(1, Math.round(config.schedule.ingestIntervalMin));
  // Default cadence is hourly, at the top of each hour (":00"). For 60, use an
  // explicit `0 * * * *` rather than `*/60` so it's unambiguous. Sub-hour
  // intervals (e.g. 15 for testing) fall back to step syntax, which spaces
  // evenly only for divisors of 60.
  const expr = min === 60 ? '0 * * * *' : `*/${min} * * * *`;
  console.log(`[scheduler] starting; ${min === 60 ? 'hourly at :00' : `every ${min} min`} (cron "${expr}"), llm=${config.llm.mode}`);

  // Run once on boot so the site isn't empty until the first interval elapses.
  tick({ offline });
  cron.schedule(expr, () => tick({ offline }));
}
