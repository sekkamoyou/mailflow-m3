import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./db.js', () => ({ query: vi.fn() }));
import { query } from './db.js';
import { getAppDisplayName, materialManifest, storedAppDisplayName, validateAppDisplayName } from './appBranding.js';

describe('instance display name and Material PWA identity', () => {
  beforeEach(() => vi.clearAllMocks());
  it('normalizes whitespace and allows a default reset', () => {
    expect(validateAppDisplayName('  우리 우편함  ')).toBe('우리 우편함');
    expect(validateAppDisplayName('   ')).toBe('MailFlow M3');
    expect(validateAppDisplayName('📬'.repeat(60))).toBe('📬'.repeat(60));
  });
  it('rejects non-text, excessive length, and control characters', () => {
    for (const value of [null, {}, 42, 'x'.repeat(61), 'a\nb', 'a\u007fb']) expect(() => validateAppDisplayName(value)).toThrow();
  });
  it('reads the shared value and safely defaults when missing or invalid', async () => {
    query.mockResolvedValueOnce({ rows: [{ value: '팀 메일' }] });
    expect(await getAppDisplayName()).toBe('팀 메일');
    expect(query).toHaveBeenCalledWith(expect.stringContaining("key = 'app_display_name'"));
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getAppDisplayName()).toBe('MailFlow M3');
    expect(storedAppDisplayName('bad\nname')).toBe('MailFlow M3');
  });
  it('keeps installation identity stable while name and short name change', () => {
    const original = materialManifest('MailFlow M3');
    expect(original).toMatchObject({ name: 'MailFlow M3', short_name: 'MailFlow M3', background_color: '#fef7ff', theme_color: '#fef7ff', display: 'standalone' });
    const renamed = materialManifest('팀 메일');
    expect(renamed).toMatchObject({ name: '팀 메일', short_name: '팀 메일', id: '/', start_url: '/', scope: '/' });
    expect(renamed.icons).toEqual(original.icons);
    expect(renamed.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
    expect(renamed.icons.some(icon => icon.purpose === 'any')).toBe(true);
    expect(renamed.icons.every(icon => icon.purpose !== 'maskable any')).toBe(true);
    expect(renamed.protocol_handlers).toEqual([{ protocol: 'mailto', url: '/?mailto=%s' }]);
  });
});
