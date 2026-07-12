import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsSignature, publishedSignature, findDuplicate } from '../src/pipeline/dedupe.js';

test('finds a duplicate when the same event is described with different wording', () => {
  const candidate = factsSignature({
    what: 'Hajduk je pobijedio Žilinu rezultatom 2:0 u prvoj utakmici prvog pretkola Europske lige',
    who: ['Hajduk', 'Žilina'],
  });
  const recent = [
    {
      headline: 'Hajduk pobijedio Žilinu 2:0 u prvom pretkolu Europske lige na Poljudu',
      tokens: publishedSignature({
        headline: 'Hajduk pobijedio Žilinu 2:0 u prvom pretkolu Europske lige na Poljudu',
        subheadline: 'Splitska momčad ostvarila je pobjedu pred više od 22 tisuće gledatelja.',
      }),
    },
  ];
  const match = findDuplicate(candidate, recent, 0.25);
  assert.ok(match, 'expected a duplicate match');
  assert.equal(match.headline, recent[0].headline);
});

test('does not flag unrelated stories as duplicates', () => {
  const candidate = factsSignature({
    what: 'Vlada je donijela odluku o povećanju minimalne plaće za sljedeću godinu',
    who: ['Vlada Republike Hrvatske'],
  });
  const recent = [
    {
      headline: 'Hajduk pobijedio Žilinu 2:0 u prvom pretkolu Europske lige',
      tokens: publishedSignature({
        headline: 'Hajduk pobijedio Žilinu 2:0 u prvom pretkolu Europske lige',
        subheadline: null,
      }),
    },
  ];
  assert.equal(findDuplicate(candidate, recent, 0.25), null);
});

test('returns null when the candidate signature is empty', () => {
  assert.equal(findDuplicate([], [{ tokens: ['x', 'y'], headline: 'a' }], 0.25), null);
});
