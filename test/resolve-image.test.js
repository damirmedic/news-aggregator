import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveArticleImage, placeholderFor } from '../src/pipeline/resolveImage.js';

// A fake fetch returning one Pexels-shaped photo, recording the URL it was called with.
function fakePexels(photo, calls = []) {
  return async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ photos: photo ? [photo] : [] }) };
  };
}

const PHOTO = {
  url: 'https://www.pexels.com/photo/12345/',
  photographer: 'Ana Anić',
  photographer_url: 'https://www.pexels.com/@anaanic',
  src: { landscape: 'https://images.pexels.com/photos/12345/x.jpg?h=627&w=1200' },
};

test('placeholderFor maps known categories and defaults unknown ones', () => {
  assert.deepEqual(placeholderFor('sport'), {
    imageUrl: '/assets/placeholders/sport.svg',
    imageCredit: null,
    imageCreditUrl: null,
  });
  assert.equal(placeholderFor('made-up').imageUrl, '/assets/placeholders/hrvatska.svg');
});

test('offline resolves straight to a placeholder, no network', async () => {
  let called = false;
  const img = await resolveArticleImage(
    { query: 'anything', category: 'svijet', offline: true },
    { fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } }
  );
  assert.equal(called, false);
  assert.equal(img.imageUrl, '/assets/placeholders/svijet.svg');
});

test('a Pexels hit returns the landscape src + attribution', async (t) => {
  // The module reads the key from config at call time; skip if the env has none
  // wired for the test process (searchPexels short-circuits without a key).
  const { config } = await import('../src/config.js');
  if (!config.images.pexelsApiKey) {
    config.images.pexelsApiKey = 'test-key'; // safe: local config object, never logged/sent
  }
  const calls = [];
  const img = await resolveArticleImage(
    { query: 'football stadium', category: 'sport' },
    { fetchImpl: fakePexels(PHOTO, calls) }
  );
  assert.equal(img.imageUrl, PHOTO.src.landscape);
  assert.equal(img.imageCredit, 'Ana Anić');
  assert.equal(img.imageCreditUrl, PHOTO.url);
  assert.match(calls[0], /query=football\+?%?20?stadium|query=football/);
});

test('no Pexels result falls back to the category placeholder', async () => {
  const { config } = await import('../src/config.js');
  config.images.pexelsApiKey = config.images.pexelsApiKey || 'test-key';
  const img = await resolveArticleImage(
    { query: 'nonexistent subject', category: 'zagreb' },
    { fetchImpl: fakePexels(null) }
  );
  assert.equal(img.imageUrl, '/assets/placeholders/zagreb.svg');
});
