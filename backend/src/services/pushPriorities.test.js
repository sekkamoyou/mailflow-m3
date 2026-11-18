import { describe, expect, it } from 'vitest';
import { PUSH_CATEGORIES, normalizePushPriorities, selectPushUrgency, validPushPriorities } from './pushPriorities.js';

describe('push priorities', () => {
  it('defaults every category to high and keeps valid user choices', () => {
    expect(Object.values(normalizePushPriorities())).toEqual(PUSH_CATEGORIES.map(() => 'high'));
    expect(normalizePushPriorities({ newsletter: 'normal', promotion: 'invalid' })).toMatchObject({ newsletter: 'normal', promotion: 'high' });
  });
  it.each([null, [], {}, 'high', { other: 'high' }, { primary: null }, { primary: 'urgent' }])('rejects invalid settings %j', value => {
    expect(validPushPriorities(value)).toBe(false);
  });
  it('accepts partial settings and all four protocol urgency values', () => {
    expect(validPushPriorities({ primary: 'high', newsletter: 'normal', promotion: 'low', automated: 'very-low' })).toBe(true);
  });
  it('uses primary for unclassified mail and the highest urgency for a mixed batch', () => {
    expect(selectPushUrgency({ primary: 'low' }, [null])).toBe('low');
    expect(selectPushUrgency({ newsletter: 'low', promotion: 'very-low' }, ['newsletter', 'promotion'])).toBe('low');
    expect(selectPushUrgency({ newsletter: 'low' }, ['newsletter', 'automated'])).toBe('high');
    expect(selectPushUrgency({ primary: 'very-low' }, [])).toBe('high');
    expect(selectPushUrgency({}, ['unknown'])).toBe('high');
  });
});
