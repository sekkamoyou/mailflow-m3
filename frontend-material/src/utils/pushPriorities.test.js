import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePushPriorities, PUSH_CATEGORIES } from './pushPriorities.js';

test('every missing or malformed priority falls back to high', () => {
  const allHigh = Object.fromEntries(PUSH_CATEGORIES.map(key => [key, 'high']));
  for (const raw of [undefined, null, [], 'low', 0, { primary: 'urgent', newsletter: null, promotion: false, automated: {}, social: [] }]) {
    assert.deepEqual(normalizePushPriorities(raw), allHigh);
  }
});
test('normalization keeps the four values for known categories and ignores unknown or inherited keys', () => {
  assert.deepEqual(normalizePushPriorities({ primary: 'normal', newsletter: 'low', promotion: 'very-low', automated: 'high', extra: 'low' }),
    { primary: 'normal', newsletter: 'low', promotion: 'very-low', automated: 'high', social: 'high' });
  assert.equal(normalizePushPriorities(Object.create({ primary: 'low' })).primary, 'high');
});
