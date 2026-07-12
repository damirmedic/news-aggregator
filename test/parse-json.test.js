import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonObject } from '../src/llm/client.js';

test('parses a plain JSON object', () => {
  assert.deepEqual(parseJsonObject('{"a": 1}'), { a: 1 });
});

test('tolerates code fences and surrounding prose', () => {
  assert.deepEqual(parseJsonObject('Here you go:\n```json\n{"a": 1}\n```\nEnjoy!'), { a: 1 });
});

test('tolerates trailing junk after the object (observed live failure)', () => {
  assert.deepEqual(parseJsonObject('{"a": 1} trailing garbage the model added'), { a: 1 });
});

test('takes the first object when the model emits two', () => {
  assert.deepEqual(parseJsonObject('{"a": 1}\n{"a": 2}'), { a: 1 });
});

test('is not fooled by braces or escaped quotes inside strings', () => {
  assert.deepEqual(parseJsonObject('{"quote": "kaže: \\"to je {vrh}\\" danas"} extra'), {
    quote: 'kaže: "to je {vrh}" danas',
  });
});

test('throws on truncated JSON rather than mis-parsing', () => {
  assert.throws(() => parseJsonObject('{"a": {"b": 1}'), /truncated/);
});

test('throws when there is no JSON at all', () => {
  assert.throws(() => parseJsonObject('sorry, I cannot help with that'), /did not return JSON/);
});
