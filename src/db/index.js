// SQLite connection + schema migration + source seeding.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { sources as sourceSeed } from '../sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../db/schema.sql');

let db;

/** Lazily open (and cache) the SQLite connection. */
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.paths.db), { recursive: true });
  db = new Database(config.paths.db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/**
 * Apply the schema (idempotent) and upsert the source seed list.
 * Safe to run repeatedly — used by `npm run migrate` and before every ingest.
 */
export function migrate() {
  const database = getDb();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  database.exec(schema);
  // CREATE TABLE IF NOT EXISTS doesn't add columns to an already-existing
  // table, so new nullable columns need an explicit additive migration.
  ensureColumn(database, 'articles', 'image_url', 'TEXT');
  seedSources(database);
  return database;
}

/** Add `column` to `table` if it doesn't already exist. Additive only. */
function ensureColumn(database, table, column, definition) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Upsert sources by rss_url. Updates name/track/active to match the seed so
 * `src/sources.js` stays the single source of truth. Does not delete rows for
 * sources removed from the seed (keeps their raw_items intact).
 */
function seedSources(database) {
  const upsert = database.prepare(`
    INSERT INTO sources (name, rss_url, track, active)
    VALUES (@name, @rss_url, @track, @active)
    ON CONFLICT(rss_url) DO UPDATE SET
      name   = excluded.name,
      track  = excluded.track,
      active = excluded.active
  `);
  const seedAll = database.transaction((rows) => {
    for (const s of rows) {
      upsert.run({
        name: s.name,
        rss_url: s.rssUrl,
        track: s.track,
        active: s.active ? 1 : 0,
      });
    }
  });
  seedAll(sourceSeed);
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}
