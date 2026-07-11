import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the DB at a throwaway file BEFORE importing anything that reads config.
// (dotenv won't override an already-set process.env var, so this wins.)
const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'news-test-')), 'test.db');
process.env.DB_PATH = tmpDb;
process.env.LLM_MODE = 'stub';

let migrate, closeDb, insertRawItem, getActiveSources, getNewItemsForSource;

before(async () => {
  ({ migrate, closeDb } = await import('../src/db/index.js'));
  ({ insertRawItem, getActiveSources, getNewItemsForSource } = await import('../src/db/queries.js'));
  migrate();
});

after(() => {
  closeDb();
  fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true });
});

test('migrate seeds at least one active source', () => {
  const active = getActiveSources();
  assert.ok(active.length >= 1, 'expected at least one active source after migrate');
});

test('insertRawItem dedupes by URL', () => {
  const source = getActiveSources()[0];
  const row = {
    sourceId: source.id,
    title: 'Test naslov',
    link: 'https://example-portal.hr/vijesti/dedupe-me',
    pubDate: '2026-07-11T06:00:00.000Z',
    fetchedAt: new Date().toISOString(),
  };

  const first = insertRawItem(row);
  assert.notEqual(first, null, 'first insert should create a row');

  const second = insertRawItem({ ...row, title: 'Isti link, drugi naslov' });
  assert.equal(second, null, 'second insert with same link should be ignored');

  const items = getNewItemsForSource(source.id, 50);
  const matches = items.filter((i) => i.link === row.link);
  assert.equal(matches.length, 1, 'only one row should exist for the duplicated link');
});
