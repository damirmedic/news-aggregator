import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDrop, normalize, isTooOld } from '../src/pipeline/filter.js';

test('normalize lowercases and strips Croatian diacritics', () => {
  assert.equal(normalize('ČAKOVEC Živjeli Đaci'), 'cakovec zivjeli daci');
});

test('keeps ordinary domestic news', () => {
  const r = shouldDrop({
    title: 'Vlada donijela odluku o proračunu za 2027.',
    link: 'https://example-portal.hr/vijesti/proracun-2027',
  });
  assert.equal(r.drop, false);
  assert.equal(r.reason, null);
});

test('drops horoscopes by URL path', () => {
  const r = shouldDrop({
    title: 'Dnevni pregled',
    link: 'https://example-portal.hr/horoskop/dnevni-petak',
  });
  assert.equal(r.drop, true);
  assert.equal(r.reason, 'excluded-url-pattern');
});

test('drops galleries by title (FOTO / galerija)', () => {
  const r = shouldDrop({
    title: 'FOTO Pogledajte galeriju s otvorenja',
    link: 'https://example-portal.hr/vijesti/nesto',
  });
  assert.equal(r.drop, true);
  assert.equal(r.reason, 'gallery');
});

test('drops live-tickers even when title uses diacritics (uživo)', () => {
  const r = shouldDrop({
    title: 'UŽIVO Prosvjed u centru grada',
    link: 'https://example-portal.hr/vijesti/prosvjed',
  });
  assert.equal(r.drop, true);
  assert.equal(r.reason, 'live-ticker');
});

test('drops sponsored content', () => {
  const r = shouldDrop({
    title: 'SPONZORIRANO Nova ponuda za ljeto',
    link: 'https://example-portal.hr/vijesti/ponuda',
  });
  assert.equal(r.drop, true);
  assert.equal(r.reason, 'sponsored');
});

test('drops items with a malformed URL', () => {
  const r = shouldDrop({ title: 'Naslov', link: 'not-a-url' });
  assert.equal(r.drop, true);
  assert.equal(r.reason, 'invalid-url');
});

test('drops magazine/lifestyle sections by URL path', () => {
  const paths = [
    '/zabava/pjevacica-objavila-fotografije',
    '/showbiz/glumac-i-glumica',
    '/magazin/najbolji-trikovi',
    '/lifestyle/kako-do-savrsenog-doma',
    '/moda/trendovi-sezone',
    '/ljepota/njega-koze',
    '/recepti/najbolja-torta',
  ];
  for (const path of paths) {
    const r = shouldDrop({ title: 'Naslov', link: `https://example-portal.hr${path}` });
    assert.equal(r.drop, true, `expected ${path} to be dropped`);
    assert.equal(r.reason, 'excluded-url-pattern');
  }
});

test('isTooOld flags items older than the max age', () => {
  const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
  assert.equal(isTooOld(thirtyHoursAgo, 24), true);
});

test('isTooOld keeps items within the max age', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  assert.equal(isTooOld(twoHoursAgo, 24), false);
});

test('isTooOld does not punish a missing or unparseable pubDate', () => {
  assert.equal(isTooOld(null, 24), false);
  assert.equal(isTooOld(undefined, 24), false);
  assert.equal(isTooOld('not-a-date', 24), false);
});
