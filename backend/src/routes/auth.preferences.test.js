import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/materialAppearance.js', async importOriginal => ({ ...(await importOriginal()), saveMaterialAppearance: vi.fn() }));
vi.mock('../services/db.js', () => ({ query: vi.fn(), pool: {} }));
vi.mock('../index.js', () => ({
  imapManager: {
    broadcast: vi.fn(),
    updateSyncIntervalForUser: vi.fn(),
    updateFolderSyncIntervalForUser: vi.fn(),
  },
}));
vi.mock('../services/encryption.js', () => ({
  decrypt: value => value,
  encrypt: value => value,
}));
vi.mock('../services/pushNotifications.js', () => ({ pushConfigured: false }));
vi.mock('../services/hostValidation.js', () => ({
  validateHost: vi.fn(),
  resolveForConnection: vi.fn(),
}));
vi.mock('../services/connectionPolicy.js', () => ({
  getConnectionPolicy: vi.fn(),
}));
vi.mock('../services/authLimiter.js', () => ({
  authLimiterConfig: { maxRequests: 10, windowMs: 900000 },
}));
vi.mock('../services/authEvents.js', () => ({ logAuthEvent: vi.fn() }));
vi.mock('../services/mailer.js', () => ({ sendSystemEmail: vi.fn(), SystemEmailNotConfigured: class SystemEmailNotConfigured extends Error {} }));
vi.mock('./oidc.js', () => ({ buildEndSessionUrl: vi.fn() }));
vi.mock('../services/categorizer.js', () => ({
  invalidateGlobalCategorizationCache: vi.fn(),
}));
vi.mock('../services/kvStore.js', () => ({ kv: {} }));
vi.mock('../services/rateLimiter.js', () => ({
  consume: vi.fn(),
  reset: vi.fn(),
}));

import { query } from '../services/db.js';
import { saveMaterialAppearance } from '../services/materialAppearance.js';
import { imapManager } from '../index.js';
import router, { patchPreferences } from './auth.js';

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [] });
});

describe('category-specific push priorities', () => {
  it('merges only the submitted priority keys into the authenticated user preferences', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { pushPriorities: { newsletter: 'normal' }, categorizationEnabled: true } }, res);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("COALESCE(preferences->'pushPriorities', '{}'::jsonb) || $51::jsonb");
    expect(params[0]).toBe('user-1');
    expect(params[26]).toBe(true);
    expect(params[50]).toBe('{"newsletter":"normal"}');
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
  it.each([null, [], {}, { newsletter: 'urgent' }, { category: 'high' }])('rejects invalid priorities %j before any write', async pushPriorities => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { pushPriorities } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('leaves saved priorities alone when updating an unrelated preference', async () => {
    await patchPreferences({ session: { userId: 'user-1' }, body: { language: 'ko' } }, { status: vi.fn().mockReturnThis(), json: vi.fn() });
    expect(query.mock.calls[0][1][50]).toBeNull();
  });
  it('requires a signed-in session', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: {}, body: { pushPriorities: { primary: 'high' } } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(query).not.toHaveBeenCalled();
  });
  it('returns normalized high defaults without replacing other saved settings', async () => {
    query.mockResolvedValueOnce({ rows: [{ preferences: { language: 'ko', pushPriorities: { newsletter: 'low' } } }] }).mockResolvedValueOnce({ rows: [] });
    const route = router.stack.find(layer => layer.route?.path === '/preferences' && layer.route.methods.get);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await route.route.stack.at(-1).handle({ session: { userId: 'user-1' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ language: 'ko', materialAppearanceOwnerId: 'user-1', pushPriorities: { primary: 'high', newsletter: 'low', promotion: 'high', automated: 'high', social: 'high' } }));
  });
});

describe('PATCH /auth/preferences folderOrder', () => {
  it('merges folderOrder into existing preferences as JSONB', async () => {
    const folderOrder = { 'account-1': ['Archive', 'INBOX'] };
    const req = { session: { userId: 'user-1' }, body: { folderOrder } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await patchPreferences(req, res);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('SET preferences = preferences');
    expect(sql).toContain(
      "jsonb_build_object('folderOrder', $39::jsonb)",
    );
    expect(params[0]).toBe('user-1');
    expect(params[38]).toBe(JSON.stringify(folderOrder));
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

describe('PATCH /auth/preferences senderFavicons', () => {
  it('merges the senderFavicons boolean into preferences as JSONB', async () => {
    const req = { session: { userId: 'user-1' }, body: { senderFavicons: true } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await patchPreferences(req, res);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      "jsonb_build_object('senderFavicons', $40::boolean)",
    );
    expect(params[0]).toBe('user-1');
    expect(params[39]).toBe(true);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('rejects a non-boolean senderFavicons without querying', async () => {
    const req = { session: { userId: 'user-1' }, body: { senderFavicons: 'yes' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await patchPreferences(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'senderFavicons must be a boolean' });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('PATCH /auth/preferences defaultSender (#417)', () => {
  const run = async (body) => {
    const req = { session: { userId: 'user-1' }, body };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences(req, res);
    return res;
  };
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('persists an account default', async () => {
    const res = await run({ defaultSender: `account:${A}` });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("jsonb_build_object('defaultSender', $42::text)");
    expect(params[41]).toBe(`account:${A}`);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('persists an alias default, so an identity can be the default and not just an account', async () => {
    await run({ defaultSender: `alias:${A}:${B}` });
    expect(query.mock.calls[0][1][41]).toBe(`alias:${A}:${B}`);
  });

  it('persists an empty string, which is how the preference is cleared', async () => {
    // '' is meaningful: it means "no preference, fall back to last used". It must be
    // written rather than treated as an absent key, or clearing would silently no-op.
    await run({ defaultSender: '' });
    expect(query.mock.calls[0][1][41]).toBe('');
  });

  it('leaves the stored value untouched when the key is absent', async () => {
    await run({ theme: 'dark' });
    expect(query.mock.calls[0][1][41]).toBe(null);
  });

  it('rejects malformed values instead of storing something unusable', async () => {
    for (const bad of ['account:not-a-uuid', 'alias:only-one', `alias:${A}`, 'nonsense',
                       `ACCOUNT:${A}`, 42, {}, [], `account:${A} extra`]) {
      query.mockClear();
      const res = await run({ defaultSender: bad });
      expect(res.status, `${JSON.stringify(bad)} should be rejected`).toHaveBeenCalledWith(400);
      expect(query).not.toHaveBeenCalled();
    }
  });
});

describe('PATCH /auth/preferences hoverActionSet (#440)', () => {
  const call = async (body) => {
    const req = { session: { userId: 'user-1' }, body };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences(req, res);
    return { req, res };
  };

  it('merges a sanitized set into preferences as JSONB, canonical order, unknown keys dropped', async () => {
    // The frontend saves through schedulePrefSave like every other preference; before this
    // clause existed the key was silently dropped server-side and the setting never synced
    // across devices — localStorage made it LOOK persisted on the device that set it.
    const { res } = await call({ hoverActionSet: ['snooze', 'bogus', 'archive'] });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("jsonb_build_object('hoverActionSet', $44::jsonb)");
    expect(params[43]).toBe(JSON.stringify(['archive', 'snooze'])); // canonical order, 'bogus' gone
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('leaves the stored value untouched when the key is absent or malformed', async () => {
    await call({ theme: 'dark' });
    expect(query.mock.calls[0][1][43]).toBeNull();
    query.mockClear();
    await call({ hoverActionSet: 'markRead' }); // not an array — ignored, not stored
    expect(query.mock.calls[0][1][43]).toBeNull();
  });
});


describe('PATCH /auth/preferences autoOpenReplyDrafts', () => {
  for (const value of [true, false]) it(`persists explicit ${value}`, async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { autoOpenReplyDrafts: value } }, res);
    expect(query.mock.calls[0][0]).toContain("jsonb_build_object('autoOpenReplyDrafts', $45::boolean)");
    expect(query.mock.calls[0][1][44]).toBe(value);
  });
  it('rejects a nonboolean without a write', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { autoOpenReplyDrafts: 'true' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('PATCH /auth/preferences afterRemove (#572)', () => {
  it.each(['next', 'previous', 'list'])('stores %s', async (value) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { afterRemove: value } }, res);
    expect(query.mock.calls[0][0]).toContain("jsonb_build_object('afterRemove', $46::text)");
    expect(query.mock.calls[0][1][45]).toBe(value);
  });

  it.each(['open', '', 3, null])('ignores %p', async (value) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { afterRemove: value } }, res);
    expect(query.mock.calls[0][1][45]).toBeNull();
  });
});

describe('PATCH /auth/preferences darkEmailBodies (#228)', () => {
  for (const value of [true, false]) it(`persists explicit ${value}`, async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { darkEmailBodies: value } }, res);
    expect(query.mock.calls[0][0]).toContain("jsonb_build_object('darkEmailBodies', $47::boolean)");
    expect(query.mock.calls[0][1][46]).toBe(value);
  });
  it('rejects a nonboolean without a write', async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await patchPreferences({ session: { userId: 'user-1' }, body: { darkEmailBodies: 'yes' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(query).not.toHaveBeenCalled();
  });
});


describe('Material appearance preference route', () => {
  const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
  it('requires authentication and refuses a pending write from another owner', async () => {
    const res = response();
    await patchPreferences({ session: {}, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    await patchPreferences({ session: { userId: 'u2' }, body: { materialAppearance: { ownerId: 'u1', device: 'mobile', mode: 'separate' } } }, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(query).not.toHaveBeenCalled();
  });
  it('rejects invalid or mixed writes without modifying preferences', async () => {
    for (const body of [{ materialAppearance: null }, { materialAppearance: { ownerId: 'u1', device: 'mobile', mode: 'shared' }, theme: 'dark' }]) {
      const res = response();
      await patchPreferences({ session: { userId: 'u1' }, body }, res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it('returns the saved value and broadcasts only to this user', async () => {
    const config = { mode: 'shared', revision: 2, shared: { theme: 'dark' } };
    saveMaterialAppearance.mockResolvedValue(config);
    const operation = { ownerId: 'u1', device: 'desktop', target: 'shared', changes: { theme: 'dark' } };
    const res = response();
    await patchPreferences({ session: { userId: 'u1' }, body: { materialAppearance: operation } }, res);
    expect(saveMaterialAppearance).toHaveBeenCalledWith('u1', operation);
    expect(imapManager.broadcast).toHaveBeenCalledWith({ type: 'material_appearance_updated' }, 'u1');
    expect(res.json).toHaveBeenCalledWith({ ok: true, materialAppearance: config });
  });
});


describe('Material appearance response ownership', () => {
  it('returns session ownership separately from stored profile data', async () => {
    const stored = { materialAppearance: { mode: 'shared' }, materialAppearanceOwnerId: 'forged-old-value', language: 'ko' };
    query.mockResolvedValueOnce({ rows: [{ preferences: stored }] }).mockResolvedValueOnce({ rows: [] });
    const res = { json: vi.fn() };
    const handler = router.stack.find(layer => layer.route?.path === '/preferences' && layer.route.methods.get).route.stack[0].handle;
    await handler({ session: { userId: 'u1' } }, res);
    expect(res.json).toHaveBeenCalledWith({ ...stored, materialAppearanceOwnerId: 'u1', pushPriorities: {
      primary: 'high', newsletter: 'high', promotion: 'high', automated: 'high', social: 'high',
    } });
    expect(stored.materialAppearanceOwnerId).toBe('forged-old-value');
  });
});

describe('PATCH /auth/preferences listSort', () => {
  const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
  const account = '22222222-2222-4222-8222-222222222222';

  it('stores each folder\'s order and leaves out folders at the default', async () => {
    const listSort = {
      [`${account}:Archive`]: { sort: 'from', dir: 'asc', starredFirst: false },
      'all:INBOX': { sort: 'date', dir: 'desc', starredFirst: true },
      [`${account}:INBOX`]: { sort: 'date', dir: 'desc', starredFirst: false },
    };
    await patchPreferences({ session: { userId: 'user-1' }, body: { listSort } }, res());

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("jsonb_build_object('listSort', $48::jsonb)");
    expect(JSON.parse(params[47])).toEqual({
      [`${account}:Archive`]: { sort: 'from', dir: 'asc', starredFirst: false },
      'all:INBOX': { sort: 'date', dir: 'desc', starredFirst: true },
    });
  });

  it('leaves listSort alone when it is not sent', async () => {
    await patchPreferences({ session: { userId: 'user-1' }, body: { pageSize: '50' } }, res());
    expect(query.mock.calls[0][1][47]).toBeNull();
  });

  for (const [name, listSort] of [
    ['an array', []],
    ['an unknown order', { 'all:INBOX': { sort: 'size' } }],
    ['an unknown direction', { 'all:INBOX': { sort: 'from', dir: 'up' } }],
    ['a key without an account', { INBOX: { sort: 'from' } }],
    ['a non-boolean starredFirst', { 'all:INBOX': { starredFirst: 'yes' } }],
  ]) {
    it(`refuses ${name}`, async () => {
      const r = res();
      await patchPreferences({ session: { userId: 'user-1' }, body: { listSort } }, r);
      expect(r.status).toHaveBeenCalledWith(400);
      expect(query).not.toHaveBeenCalled();
    });
  }
});

describe('PATCH /auth/preferences timeFormat (#758)', () => {
  const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });

  for (const value of ['auto', '12', '24']) {
    it(`stores ${value}`, async () => {
      await patchPreferences({ session: { userId: 'user-1' }, body: { timeFormat: value } }, res());
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("jsonb_build_object('timeFormat', $49::text)");
      expect(params[48]).toBe(value);
    });
  }

  it('ignores an unknown value rather than persisting it', async () => {
    await patchPreferences({ session: { userId: 'user-1' }, body: { timeFormat: '13' } }, res());
    expect(query.mock.calls[0][1][48]).toBeNull();
  });

  it('leaves timeFormat alone when it is not sent', async () => {
    await patchPreferences({ session: { userId: 'user-1' }, body: { pageSize: '50' } }, res());
    expect(query.mock.calls[0][1][48]).toBeNull();
  });
});
