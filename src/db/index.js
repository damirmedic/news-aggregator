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
  seedSources(database);
  return database;
}

/**
 * Upsert sources by rss_url. Updates name/category/active to match the seed so
 * `src/sources.js` stays the single source of truth. Does not delete rows for
 * sources removed from the seed (keeps their raw_items intact).
 */
function seedSources(database) {
  const upsert = database.prepare(`
    INSERT INTO sources (name, rss_url, category, active)
    VALUES (@name, @rss_url, @category, @active)
    ON CONFLICT(rss_url) DO UPDATE SET
      name     = excluded.name,
      category = excluded.category,
      active   = excluded.active
  `);
  const seedAll = database.transaction((rows) => {
    for (const s of rows) {
      upsert.run({
        name: s.name,
        rss_url: s.rssUrl,
        category: s.category,
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
