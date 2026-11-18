import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./db.js', () => ({ withTransaction: vi.fn() }));
import { withTransaction } from './db.js';
import { mergeAppearance, saveMaterialAppearance, validateAppearanceOperation } from './materialAppearance.js';
const initial = { theme: 'dark', colorPalette: '#123456', customColor: '#123456', displayName: '개인 우편함' };
const op = changes => ({ ownerId: 'u1', device: 'desktop', target: 'shared', changes });
const initialize = () => mergeAppearance(null, { device: 'desktop', initialize: initial });

describe('Material appearance validation', () => {
  it('accepts themes, all named palettes, HEX, empty override and Unicode names', () => {
    for (const colorPalette of ['purple', 'blue', 'teal', 'green', 'orange', 'rose', '#aBcD12']) {
      expect(validateAppearanceOperation(op({ theme: 'system', colorPalette, customColor: '#123456', displayName: '팀 편지함 📬' }))).toBe(true);
    }
    expect(validateAppearanceOperation(op({ displayName: '' }))).toBe(true);
    expect(validateAppearanceOperation({ ownerId: 'u1', device: 'mobile', mode: 'separate' })).toBe(true);
  });
  it('rejects invalid operations and bounded profile fields', () => {
    for (const value of [null, [], {}, { ...op({ theme: 'dark' }), device: 'tablet' },
      { ...op({ theme: 'dark' }), target: 'mobile' }, { ...op({ theme: 'dark' }), extra: true },
      { ...op({ theme: 'dark' }), initialize: initial }, op({}), op([]), op({ theme: 'legacy' }),
      op({ colorPalette: 'red' }), op({ colorPalette: '#123' }), op({ customColor: 'red' }),
      op({ displayName: 'a'.repeat(61) }), op({ displayName: 'bad\nname' }), op({ displayName: '\u202ename' }),
      op({ displayName: 42 }), op({ app_display_name: 'global' })]) expect(validateAppearanceOperation(value)).toBe(false);
  });
});

describe('Material appearance merge', () => {
  it('migrates once; an existing server value wins concurrent initialization', () => {
    const stored = initialize();
    expect(stored.shared).toEqual(initial);
    expect(mergeAppearance(stored, { initialize: { theme: 'light' } })).toBe(stored);
  });
  it('retains separate profiles and restores them after shared visits', () => {
    let config = mergeAppearance(initialize(), { device: 'desktop', mode: 'separate' });
    config = mergeAppearance(config, { device: 'mobile', target: 'mobile', changes: { colorPalette: 'green', displayName: '폰' } });
    config = mergeAppearance(config, { device: 'desktop', target: 'desktop', changes: { theme: 'light' } });
    config = mergeAppearance(config, { device: 'mobile', mode: 'shared' });
    expect(config.shared.displayName).toBe('폰');
    config = mergeAppearance(config, op({ colorPalette: 'blue' }));
    config = mergeAppearance(config, { device: 'desktop', mode: 'separate' });
    expect(config.desktop.theme).toBe('light');
    expect(config.mobile.colorPalette).toBe('green');
    expect(config.shared.colorPalette).toBe('blue');
  });
  it('merges only changed fields and explicitly targeted profiles', () => {
    let config = mergeAppearance(initialize(), { device: 'desktop', mode: 'separate' });
    config = mergeAppearance(config, { device: 'mobile', target: 'mobile', changes: { theme: 'light' } });
    config = mergeAppearance(config, { device: 'desktop', mode: 'shared' });
    config = mergeAppearance(config, { device: 'mobile', target: 'mobile', changes: { colorPalette: 'green' } });
    expect(config.mobile.theme).toBe('light');
    expect(config.mobile.colorPalette).toBe('green');
    expect(config.shared.colorPalette).toBe('#123456');
  });
});

describe('account-scoped atomic storage', () => {
  beforeEach(() => { withTransaction.mockReset(); });
  it('locks the user row and updates only materialAppearance in JSONB', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ preferences: { unrelated: 'keep', materialAppearance: initialize() } }] }).mockResolvedValue({ rows: [] });
    withTransaction.mockImplementation(fn => fn({ query }));
    const result = await saveMaterialAppearance('u1', op({ displayName: ' 새 이름 ' }));
    expect(query.mock.calls[0]).toEqual(['SELECT preferences FROM users WHERE id = $1 FOR UPDATE', ['u1']]);
    expect(query.mock.calls[1][0]).toContain('jsonb_set(COALESCE(preferences');
    expect(query.mock.calls[1][0]).toContain("'{materialAppearance}'");
    expect(query.mock.calls[1][0]).toContain('WHERE id = $1');
    expect(JSON.parse(query.mock.calls[1][1][1])).toEqual(result);
    expect(result.shared.displayName).toBe('새 이름');
    expect(result.shared.theme).toBe('dark');
    expect(result).not.toHaveProperty('unrelated');
  });
  it('does not replace settings on repeated migration', async () => {
    const stored = initialize();
    const query = vi.fn().mockResolvedValue({ rows: [{ preferences: { materialAppearance: stored } }] });
    withTransaction.mockImplementation(fn => fn({ query }));
    expect(await saveMaterialAppearance('u1', { initialize: { theme: 'light' } })).toBe(stored);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
