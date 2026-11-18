import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAppearanceSlice, appearanceDevice } from './appearance.js';
import { api } from '../utils/api.js';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const originalGet = api.getPreferences, originalSave = api.savePreferences;
afterEach(() => { api.getPreferences = originalGet; api.savePreferences = originalSave; values.clear(); });
const config = (fields = {}, revision = 1) => ({ mode: 'shared', shared: { theme: 'dark', colorPalette: 'blue', customColor: '#123456', displayName: '우편함', ...fields }, revision });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function store() {
  let state = { isLocked: false };
  const set = values => { state = { ...state, ...values }; };
  const get = () => state;
  state = { ...state, ...createAppearanceSlice(set, get) };
  return { get, set };
}
function saver(initial = config()) {
  let server = structuredClone(initial);
  const calls = [];
  api.savePreferences = async ({ materialAppearance: op }) => {
    calls.push(op);
    if (op.initialize) server ||= config(op.initialize);
    else {
      if (op.mode === 'separate') { server.mobile ||= { ...server.shared }; server.desktop ||= { ...server.shared }; }
      if (op.mode === 'shared' && server.mode === 'separate') server.shared = { ...server[op.device] };
      if (op.mode) server.mode = op.mode;
      if (op.changes) server[op.target] = { ...server[op.target], ...op.changes };
      server.revision++;
    }
    return { materialAppearance: structuredClone(server) };
  };
  return calls;
}

test('device classification is independent of desktop window width', () => {
  globalThis.window = { innerWidth: 320 };
  assert.equal(appearanceDevice({ userAgent: 'Macintosh', maxTouchPoints: 0 }), 'desktop');
  assert.equal(appearanceDevice({ userAgent: 'Android Chrome Mobile' }), 'mobile');
  assert.equal(appearanceDevice({ userAgent: 'Macintosh', maxTouchPoints: 5 }), 'mobile');
  assert.equal(appearanceDevice({ userAgentData: { mobile: true } }), 'mobile');
  delete globalThis.window;
});

test('server appearance wins legacy cache and personal name falls back to global branding', async () => {
  values.set('mailflow_material_palette', 'green');
  const s = store(); s.get().switchAppearanceUser('u1');
  await s.get().hydrateAppearance(config());
  assert.equal(s.get().colorPalette, 'blue');
  assert.equal(s.get().appDisplayName, '우편함');
  s.get().setAppDisplayName('전역 서버');
  assert.equal(s.get().appDisplayName, '우편함');
  saver(); s.get().setPersonalDisplayName(''); await s.get().flushAppearance();
  assert.equal(s.get().appDisplayName, '전역 서버');
  s.get().switchAppearanceUser(null);
});

test('uses the product name before server branding arrives and after a reset', () => {
  const s = store();
  assert.equal(s.get().appDisplayName, 'MailFlow M3');
  s.get().setAppDisplayName('팀 우편함');
  assert.equal(s.get().appDisplayName, '팀 우편함');
  s.get().setAppDisplayName(' ');
  assert.equal(s.get().appDisplayName, 'MailFlow M3');
});

test('migrates local colors only when the server has no settings', async () => {
  values.set('mailflow_material_palette', '#abcdef'); values.set('mailflow_material_theme', 'light');
  const s = store(); s.get().switchAppearanceUser('u1');
  const calls = saver(null);
  await s.get().hydrateAppearance(undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].initialize.colorPalette, '#abcdef');
  assert.equal(calls[0].initialize.theme, 'light');
  assert.equal(calls[0].ownerId, 'u1');
  s.get().switchAppearanceUser(null);
});

test('shared/separate transitions keep saved device profiles', async () => {
  const s = store(); s.get().switchAppearanceUser('u1');
  await s.get().hydrateAppearance(config()); saver();
  s.get().setAppearanceMode('separate'); await s.get().flushAppearance();
  s.get().setColorPalette('green'); await s.get().flushAppearance();
  s.get().setAppearanceMode('shared'); await s.get().flushAppearance();
  s.get().setColorPalette('rose'); await s.get().flushAppearance();
  s.get().setAppearanceMode('separate'); await s.get().flushAppearance();
  assert.equal(s.get().colorPalette, 'green');
  s.get().switchAppearanceUser(null);
});

test('late GET rebases pending fields and never overwrites a local edit', async () => {
  const s = store(); s.get().switchAppearanceUser('u1');
  await s.get().hydrateAppearance(config());
  const read = deferred(); api.getPreferences = () => read.promise;
  const refreshing = s.get().refreshAppearance();
  saver(config({ displayName: '새 이름' }, 2));
  s.get().setColorPalette('#abcdef');
  read.resolve({ materialAppearance: config({ displayName: '새 이름' }, 2) }); await refreshing;
  assert.equal(s.get().colorPalette, '#abcdef');
  assert.equal(s.get().appDisplayName, '새 이름');
  s.get().switchAppearanceUser(null);
});

test('serial writes retain newer edits while a save is in flight', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config());
  const first = deferred(); const calls = [];
  api.savePreferences = async ({ materialAppearance: op }) => {
    calls.push(op);
    return calls.length === 1 ? first.promise : { materialAppearance: config({ theme: 'light', colorPalette: 'green' }, 3) };
  };
  s.get().setTheme('light'); const saving = s.get().flushAppearance();
  s.get().setColorPalette('green');
  await s.get().hydrateAppearance(config({ colorPalette: 'orange' }, 2));
  first.resolve({ materialAppearance: config({ theme: 'light' }, 2) }); await saving;
  assert.equal(calls.length, 2); assert.equal(calls[1].changes.colorPalette, 'green');
  assert.equal(s.get().theme, 'light'); assert.equal(s.get().colorPalette, 'green');
  s.get().switchAppearanceUser(null);
});

test('failure is visible, retry preserves edits, and account switches drop old work', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config());
  api.savePreferences = async () => { throw new Error('offline'); };
  s.get().setColorPalette('green'); await s.get().flushAppearance();
  assert.equal(s.get().appearanceStatus, 'error');
  assert.equal(s.get().colorPalette, 'green');
  const calls = saver(); await s.get().retryAppearance();
  assert.equal(calls[0].ownerId, 'u1'); assert.equal(s.get().appearanceStatus, 'saved');
  s.get().setColorPalette('teal'); s.get().switchAppearanceUser('u2'); await s.get().flushAppearance();
  assert.equal(calls.length, 1); assert.equal(s.get().colorPalette, 'purple'); assert.equal(s.get().personalDisplayName, '');
  s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config({ colorPalette: 'green' }, 2));
  assert.equal(s.get().colorPalette, 'teal');
  s.get().switchAppearanceUser(null);
});

test('late response after account switch cannot change the new user', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config());
  const pending = deferred(); api.savePreferences = () => pending.promise;
  s.get().setTheme('light'); const saving = s.get().flushAppearance();
  s.get().switchAppearanceUser('u2'); await s.get().hydrateAppearance(config({ displayName: '다른 사용자', theme: 'dark' }));
  pending.resolve({ materialAppearance: config({ theme: 'light' }, 2) }); await saving;
  assert.equal(s.get().theme, 'dark'); assert.equal(s.get().appDisplayName, '다른 사용자');
  s.get().switchAppearanceUser(null);
});

test('older reads are ignored and a failed read is surfaced and recoverable', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config({}, 5));
  api.getPreferences = async () => ({ materialAppearance: config({ colorPalette: 'green' }, 4) });
  await s.get().refreshAppearance(); assert.equal(s.get().colorPalette, 'blue');
  api.getPreferences = async () => { throw new Error('offline'); };
  await s.get().refreshAppearance(); assert.equal(s.get().appearanceStatus, 'error');
  api.getPreferences = async () => ({ materialAppearance: config({ colorPalette: 'green' }, 6) });
  await s.get().retryAppearance(); assert.equal(s.get().colorPalette, 'green');
  s.get().switchAppearanceUser(null);
});

test('mobile and desktop caches do not share a pending journal even on one origin', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const desktop = store(); desktop.get().switchAppearanceUser('u1'); await desktop.get().hydrateAppearance(config());
  desktop.get().setTheme('light');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Android Mobile' } });
  const mobile = store(); mobile.get().switchAppearanceUser('u1');
  try {
    assert.equal(mobile.get().appearanceDevice, 'mobile');
    assert.equal(mobile.get().theme, 'system');
    const desktopCache = JSON.parse(values.get('mailflow_material_appearance:u1:desktop'));
    const mobileCache = JSON.parse(values.get('mailflow_material_appearance:u1:mobile'));
    assert.equal(desktopCache.pending[0].changes.theme, 'light');
    assert.equal(mobileCache.pending.length, 0);
  } finally {
    desktop.get().switchAppearanceUser(null); mobile.get().switchAppearanceUser(null);
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});

test('a late failed refresh cannot replace a newer successful refresh status', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config());
  const old = deferred(); let count = 0;
  api.getPreferences = () => ++count === 1 ? old.promise : Promise.resolve({ materialAppearance: config({ colorPalette: 'green' }, 2) });
  const oldRefresh = s.get().refreshAppearance();
  await s.get().refreshAppearance(); old.reject(new Error('old failure')); await oldRefresh;
  assert.equal(s.get().colorPalette, 'green'); assert.equal(s.get().appearanceStatus, 'saved');
  s.get().switchAppearanceUser(null);
});

test('a response authenticated as another user cannot hydrate the current account', async () => {
  const s = store(); s.get().switchAppearanceUser('u1'); await s.get().hydrateAppearance(config(), 'u1');
  let expired = 0;
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  globalThis.window = { dispatchEvent: event => { if (event.type === 'mailflow:session_expired') expired++; } };
  try {
    assert.equal(await s.get().hydrateAppearance(config({ displayName: '다른 계정' }, 10), 'u2'), false);
    assert.equal(s.get().appDisplayName, '우편함');
    assert.equal(s.get().appearanceStatus, 'error');
    api.getPreferences = async () => ({ materialAppearance: config({ colorPalette: 'green' }, 11), materialAppearanceOwnerId: 'u2' });
    await s.get().refreshAppearance();
    assert.equal(s.get().colorPalette, 'blue'); assert.equal(expired, 2);
  } finally { delete globalThis.window; delete globalThis.CustomEvent; s.get().switchAppearanceUser(null); }
});
