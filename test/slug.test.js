import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleSlug } from '../src/publish/templates.js';

// A midday UTC time keeps the Zagreb-local date unambiguous regardless of DST.
const JUL = '2026-07-22T10:00:00Z';

test('handleizes a headline and appends the Zagreb-local publish date', () => {
  assert.equal(
    articleSlug('Morgan Rogers prešao iz Aston Ville u Chelsea za 117 milijuna funti', JUL),
    'morgan-rogers-presao-iz-aston-ville-u-chelsea-2026-07-22'
  );
});

test('transliterates Croatian diacritics (š č ć ž đ)', () => {
  assert.equal(
    articleSlug('Đakovo: čačkalica žličica ćup', JUL),
    'dakovo-cackalica-zlicica-cup-2026-07-22'
  );
});

test('a short title is kept whole, including a trailing score', () => {
  assert.equal(articleSlug('Rezultat 2:1', JUL), 'rezultat-2-1-2026-07-22');
});

test('truncation drops a severed trailing number/connector, not a real ending', () => {
  // Long enough to truncate; the cut lands mid-phrase and the "-za-117" tail
  // is dropped as noise.
  const s = articleSlug(
    'Dinamo pobijedio Hajduk u derbiju pred punim stadionom u Maksimiru za naslov',
    JUL
  );
  assert.ok(!/-\d+$/.test(s.replace(/-\d{4}-\d{2}-\d{2}$/, '')), `unexpected trailing number: ${s}`);
  assert.ok(s.endsWith('-2026-07-22'));
  assert.ok(s.length <= 60 + '-2026-07-22'.length);
});

test('empty/garbage headline still yields a usable slug', () => {
  assert.equal(articleSlug('!!! ??? ...', JUL), 'clanak-2026-07-22');
});
