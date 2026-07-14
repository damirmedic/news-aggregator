import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  numericTokens,
  findUnsupportedNumbers,
  verifySummary,
  verifyFacts,
} from '../src/pipeline/verify.js';

// ---------------------------------------------------------------------------
// The observed real-world failure this module exists for: the source said the
// artist is working on a project involving 450 MUSICIANS; the published
// summary claimed the new album LASTS 450 MINUTES. The bare figure passes any
// presence check — the unit-adjacency check is what has to catch it.
// ---------------------------------------------------------------------------
test('catches the 450-musicians -> 450-minutes re-attachment hallucination', () => {
  const facts = {
    who: ['Poznati glazbenik'],
    what: 'Glazbenik je najavio novi album i projekt u kojem sudjeluje 450 glazbenika',
    when: null,
    where: null,
    why: null,
    numbers: ['450 glazbenika u projektu'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Glazbenik najavio novi album',
      subheadline: 'Novi album traje 450 minuta.',
      body: 'Glazbenik je najavio novi album koji traje 450 minuta.',
    },
    facts
  );
  assert.ok(problems.length > 0, 'expected the re-attached figure to be flagged');
  assert.ok(
    problems.some((p) => p.includes('450 minuta')),
    `expected "450 minuta" in problems, got: ${problems.join(' | ')}`
  );
});

test('accepts the same figure used with the referent the facts state', () => {
  const facts = {
    who: ['Poznati glazbenik'],
    what: 'Glazbenik je najavio projekt u kojem sudjeluje 450 glazbenika',
    numbers: ['450 glazbenika u projektu'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Glazbenik najavio projekt s 450 glazbenika',
      subheadline: 'U projektu sudjeluje 450 glazbenika.',
      body: 'U novom projektu sudjelovat će 450 glazbenika.',
    },
    facts
  );
  assert.deepEqual(problems, []);
});

test('flags a figure that appears nowhere in the facts at all', () => {
  const facts = {
    who: ['Vlada'],
    what: 'Vlada je donijela odluku o obnovi škole',
    numbers: [],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Vlada odobrila obnovu škole',
      subheadline: 'Projekt je vrijedan 23 milijuna eura.',
      body: 'Obnova škole vrijedna 23 milijuna eura počinje na jesen.',
    },
    facts
  );
  assert.ok(problems.some((p) => p.includes('23')), 'invented "23" should be flagged');
});

test('tolerates Croatian number formatting differences (9.954 vs 9954, 8.372 vs 8372)', () => {
  const facts = {
    what: 'Izrečene su kazne u iznosu od 9954 eura, uz 8372 pregledana slučaja',
    numbers: ['9954 eura kazni', '8372 pregledana slučaja'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Izrečene kazne od 9.954 eura',
      subheadline: 'Pregledana su 8.372 slučaja.',
      body: 'Kazne iznose 9.954 eura, uz 8.372 pregledana slučaja.',
    },
    facts
  );
  assert.deepEqual(problems, []);
});

test('score-like and clock-like tokens keep their colon and match correctly', () => {
  assert.ok(numericTokens('pobjeda 2:1 u 22:00').has('2:1'));
  assert.ok(numericTokens('pobjeda 2:1 u 22:00').has('22:00'));
  const problems = verifySummary(
    { headline: 'Pobjeda 2:1', subheadline: null, body: 'Utakmica je završila 2:1.' },
    { what: 'Utakmica je završila rezultatom 2:1', numbers: ['2:1 rezultat'], quotes: [] }
  );
  assert.deepEqual(problems, []);
});

test('date/time words after numbers are whitelisted (months, sati, godine)', () => {
  const facts = {
    what: 'Nesreća se dogodila 12. srpnja oko 20 sati; poginuo je 41-godišnjak',
    when: '12. srpnja 2026.',
    numbers: ['41 godina starost poginulog', '20 sati vrijeme nesreće'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'U nesreći poginuo 41-godišnjak',
      subheadline: 'Nesreća se dogodila 12. srpnja oko 20 sati.',
      body: 'Muškarac u 41. godini poginuo je 12. srpnja oko 20 sati.',
    },
    facts
  );
  assert.deepEqual(problems, []);
});

// --- facts vs source ---------------------------------------------------------

test('verifyFacts drops unsupported entries from numbers[] but keeps supported ones', () => {
  const source = 'Umjetnik radi na projektu koji uključuje 450 glazbenika iz cijele Europe.';
  const { facts, problems } = verifyFacts(
    {
      what: 'Umjetnik radi na projektu s 450 glazbenika',
      numbers: ['450 glazbenika u projektu', '630 minuta trajanje'],
      quotes: [],
    },
    source
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(facts.numbers, ['450 glazbenika u projektu']);
});

test('verifyFacts rejects an invented figure in a core field', () => {
  const source = 'Vlada je odobrila obnovu škole u Cavtatu.';
  const { problems } = verifyFacts(
    { what: 'Vlada je odobrila obnovu škole vrijednu 23 milijuna eura', numbers: [], quotes: [] },
    source
  );
  assert.ok(problems.some((p) => p.includes('23')));
});

test('verifyFacts exempts years and the when field (date resolution is legitimate)', () => {
  const source = 'Obljetnica je obilježena danas u Potočarima.';
  const { problems } = verifyFacts(
    {
      what: 'Obilježena je obljetnica u Potočarima',
      when: '11. srpnja 2026.',
      numbers: [],
      quotes: [],
    },
    source
  );
  assert.deepEqual(problems, []);
});

test('findUnsupportedNumbers ignores single digits (spelled-out numbers in prose)', () => {
  assert.deepEqual(findUnsupportedNumbers('dolaze 2 osobe', 'dolaze dvije osobe'), []);
});

test('flags a dropped numeric qualifier ("više od 2700" -> flat "2700")', () => {
  const facts = {
    what: 'Istraživanje povezuje više od 2700 smrtnih slučajeva s toplinskim valom',
    numbers: ['više od 2700 smrtnih slučajeva'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Toplinski val uzrokovao smrtne slučajeve',
      subheadline: 'U Europi je zabilježeno 2700 smrtnih slučajeva.',
      body: 'Istraživanje povezuje 2700 smrtnih slučajeva s toplinskim valom.',
    },
    facts
  );
  assert.ok(problems.some((p) => p.includes('2700')), `expected qualifier mismatch, got: ${problems.join(' | ')}`);
});

test('accepts the qualifier preserved exactly (with Croatian formatting)', () => {
  const facts = {
    what: 'Istraživanje povezuje više od 2700 smrtnih slučajeva s toplinskim valom',
    numbers: ['više od 2700 smrtnih slučajeva'],
    quotes: [],
  };
  const problems = verifySummary(
    {
      headline: 'Toplinski val povezan s više od 2.700 smrtnih slučajeva',
      subheadline: null,
      body: 'Istraživanje povezuje više od 2.700 smrtnih slučajeva s toplinskim valom.',
    },
    facts
  );
  assert.deepEqual(problems, []);
});

test('flags an invented qualifier (facts flat "450" -> summary "više od 450")', () => {
  const facts = { what: 'U projektu sudjeluje 450 glazbenika', numbers: ['450 glazbenika'], quotes: [] };
  const problems = verifySummary(
    { headline: 'Projekt okuplja glazbenike', subheadline: null, body: 'Sudjeluje više od 450 glazbenika.' },
    facts
  );
  assert.ok(problems.some((p) => p.includes('450')));
});

test('numeric dd.mm. dates are exempt from adjacency, thousands separators are not', () => {
  // Live false positive: "12.7." (a date) followed by an ordinary verb.
  const facts = { what: 'Snimka je objavljena', when: '12.7.2026.', numbers: [], quotes: [] };
  assert.deepEqual(
    verifySummary(
      { headline: 'Objavljena snimka', subheadline: null, body: 'Snimka objavljena 12.7. koristi se kao dokaz.' },
      facts
    ),
    []
  );
  // "9.954" is a thousands-separated magnitude, not a date — still checked.
  const problems = verifySummary(
    { headline: 'Kazna', subheadline: null, body: 'Kazna iznosi 9.954 minuta.' },
    { what: 'Izrečena je kazna od 9.954 eura', numbers: ['9.954 eura kazna'], quotes: [] }
  );
  assert.ok(problems.some((p) => p.includes('minuta')));
});
