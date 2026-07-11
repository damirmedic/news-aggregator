// CLI entrypoint. Usage:
//   node src/index.js migrate            create DB + seed sources
//   node src/index.js ingest [--offline] run one ingestion cycle
//   node src/index.js generate           rebuild the static site from the DB
//   node src/index.js serve              preview the generated site
//   node src/index.js start [--offline]  run the cron scheduler
//
// --offline (also INGEST_OFFLINE=1) uses bundled fixtures instead of the
// network, so the full cycle runs with no outbound access.
import { migrate, closeDb } from './db/index.js';
import { runIngestCycle } from './pipeline/run.js';
import { generateSite } from './publish/generate.js';
import { startServer } from './serve.js';
import { startScheduler } from './scheduler.js';

const args = process.argv.slice(2);
const command = args[0];
const offline = args.includes('--offline') || process.env.INGEST_OFFLINE === '1';

function usage() {
  console.log('Usage: node src/index.js <migrate|ingest|generate|serve|start> [--offline]');
}

async function main() {
  switch (command) {
    case 'migrate': {
      migrate();
      console.log('[migrate] schema applied and sources seeded');
      closeDb();
      break;
    }
    case 'ingest': {
      await runIngestCycle({ offline });
      closeDb();
      break;
    }
    case 'generate': {
      migrate();
      const { count, outPath } = generateSite();
      console.log(`[generate] wrote ${outPath} (${count} articles)`);
      closeDb();
      break;
    }
    case 'serve': {
      // Long-running; do not close the DB (server may outlive this call).
      startServer();
      break;
    }
    case 'start': {
      startScheduler({ offline });
      break;
    }
    default: {
      if (command) console.error(`Unknown command: ${command}`);
      usage();
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  closeDb();
});
