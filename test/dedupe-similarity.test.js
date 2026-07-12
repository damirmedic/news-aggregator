import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSignature, similarity, findDuplicate } from '../src/pipeline/dedupe.js';

const THRESHOLD = 0.24; // matches config.dedupe.similarityThreshold default

// Facts as the extractor would produce them for the same real event reported by
// two different portals — the main entities/numbers are the same, the event
// wording differs. These pairs are drawn from actual missed duplicates.
const CLUSTERS = {
  englandNorway: [
    {
      who: ['Engleska', 'Norveška'],
      what: 'Engleska je pobijedila Norvešku i plasirala se u polufinale Svjetskog prvenstva',
      where: 'Miami',
      numbers: ['2:1'],
    },
    {
      who: ['Engleska', 'Norveška', 'Jude Bellingham'],
      what: 'Engleska pobijedila Norvešku u četvrtfinalu Svjetskog prvenstva nakon spornoga pogotka',
      where: 'Miami',
      numbers: ['2:1'],
    },
  ],
  korculaFire: [
    {
      who: ['vatrogasci'],
      what: 'Vatrogasci gase šumski požar na nepristupačnom terenu na otoku Korčuli',
      where: 'Korčula',
      numbers: ['3'],
    },
    {
      who: ['vatrogasci'],
      what: 'Vatrogasne snage gase šumski požar na nepristupačnom terenu otoka Korčule',
      where: 'Korčula',
      numbers: ['3'],
    },
  ],
};

for (const [name, [a, b]] of Object.entries(CLUSTERS)) {
  test(`same event across portals is a duplicate: ${name}`, () => {
    const sig = buildSignature(a);
    const recent = [{ headline: 'već objavljeno', sig: buildSignature(b) }];
    assert.ok(
      similarity(sig, recent[0].sig) >= THRESHOLD,
      `expected similarity >= ${THRESHOLD}`
    );
    assert.ok(findDuplicate(sig, recent, THRESHOLD), 'expected a duplicate match');
  });
}

test('two different government decisions are NOT duplicates (shared institution only)', () => {
  const a = buildSignature({
    who: ['Vlada Republike Hrvatske'],
    what: 'Vlada je donijela odluku o povećanju minimalne plaće',
    where: 'Zagreb',
    numbers: ['970'],
  });
  const b = buildSignature({
    who: ['Vlada Republike Hrvatske'],
    what: 'Vlada je odlučila financirati obnovu željezničke pruge',
    where: 'Zagreb',
    numbers: ['300'],
  });
  assert.ok(similarity(a, b) < THRESHOLD, 'shared "Vlada"/"Zagreb" must not merge distinct decisions');
  assert.equal(findDuplicate(a, [{ headline: 'x', sig: b }], THRESHOLD), null);
});

test('unrelated sport stories are NOT duplicates', () => {
  const a = buildSignature(CLUSTERS.englandNorway[0]);
  const b = buildSignature({
    who: ['Hajduk', 'Dinamo'],
    what: 'Hajduk i Dinamo odigrali neriješeno u hrvatskom derbiju',
    where: 'Split',
    numbers: ['1:1'],
  });
  assert.ok(similarity(a, b) < THRESHOLD);
  assert.equal(findDuplicate(a, [{ headline: 'x', sig: b }], THRESHOLD), null);
});

test('findDuplicate returns the most similar match, and null for an empty signature', () => {
  const target = buildSignature(CLUSTERS.korculaFire[1]);
  const recent = [
    { headline: 'nepovezano', sig: buildSignature(CLUSTERS.englandNorway[0]) },
    { headline: 'isti požar', sig: target },
  ];
  const match = findDuplicate(buildSignature(CLUSTERS.korculaFire[0]), recent, THRESHOLD);
  assert.equal(match.headline, 'isti požar');
  assert.equal(findDuplicate({ e: [], n: [], w: '' }, recent, THRESHOLD), null);
});
