import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ load(url, context, next) {
  return url.endsWith('.json') ? { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` } : next(url, context);
} });
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
const { useStore } = await import('./index.js');
const { api } = await import('../utils/api.js');
const { normalizePushPriorities } = await import('../utils/pushPriorities.js');
const original = { get: api.getPreferences, save: api.savePreferences, hydrate: useStore.getState().hydrateAppearance };
const s = () => useStore.getState();
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let server, writes;
beforeEach(() => {
  s().setUser(null);
  useStore.setState({ isLocked: false, hydrateAppearance: async () => true });
  s().setUser({ id: 'alice' });
  server = { aiActions: [], categorizationEnabled: false };
  writes = [];
  api.getPreferences = async () => structuredClone(server);
  api.savePreferences = async patch => { writes.push(patch); server.pushPriorities = { ...server.pushPriorities, ...patch.pushPriorities }; return { ok: true }; };
});
afterEach(() => { s().setUser(null); useStore.setState({ hydrateAppearance: original.hydrate }); api.getPreferences = original.get; api.savePreferences = original.save; memory.clear(); });

test('initial/full preference hydration uses high for all missing or invalid categories', async () => {
  assert.deepEqual(s().pushPriorities, normalizePushPriorities());
  server.pushPriorities = { primary: 'low', newsletter: 'not-valid' };
  await s().loadPreferences();
  assert.deepEqual(s().pushPriorities, normalizePushPriorities(server.pushPriorities));
  assert.equal(s().pushPrioritiesStatus, 'ready');
});
test('only edited category keys are saved; returning to the saved value removes an edit', async () => {
  await s().loadPushPriorities();
  s().setPushPriority('newsletter', 'normal');
  s().setPushPriority('promotion', 'low');
  assert.equal(await s().savePushPriorities(), true);
  assert.deepEqual(writes, [{ pushPriorities: { newsletter: 'normal', promotion: 'low' } }]);
  assert.deepEqual(s().pushPriorities, normalizePushPriorities(server.pushPriorities));
  assert.equal(s().pushPrioritiesStatus, 'saved');
  s().setPushPriority('newsletter', 'high');
  s().setPushPriority('newsletter', 'normal');
  assert.deepEqual(s().pushPriorityChanges, {});
  assert.equal(await s().savePushPriorities(), false);
  assert.equal(writes.length, 1);
});
test('failed save retains pending edits and retry sends the same patch', async () => {
  await s().loadPushPriorities();s().setPushPriority('social', 'very-low');
  const save = api.savePreferences;
  api.savePreferences = async () => { throw Error('offline'); };
  assert.equal(await s().savePushPriorities(), false);
  assert.equal(s().pushPrioritiesStatus, 'save-error');
  assert.deepEqual(s().pushPriorityChanges, { social: 'very-low' });
  assert.equal(s().pushPriorities.social, 'high');
  api.savePreferences = save;
  assert.equal(await s().savePushPriorities(), true);
  assert.deepEqual(writes, [{ pushPriorities: { social: 'very-low' } }]);
});
test('a failed read cannot accidentally save defaults; retry reads the real account values', async () => {
  api.getPreferences = async () => { throw Error('offline'); };
  assert.equal(await s().loadPushPriorities(), false);
  assert.equal(s().pushPrioritiesStatus, 'load-error');
  s().setPushPriority('primary', 'low');
  assert.equal(await s().savePushPriorities(), false);
  assert.deepEqual(writes, []);
  api.getPreferences = async () => ({ pushPriorities: { primary: 'normal' } });
  assert.equal(await s().loadPushPriorities(), true);
  assert.equal(s().pushPriorities.primary, 'normal');
});
test('unknown categories or values never become a pending write', async () => {
  await s().loadPushPriorities();
  for (const [key, value] of [['other', 'low'], ['__proto__', 'low'], ['primary', null], ['primary', 'urgent']]) s().setPushPriority(key, value);
  assert.equal(await s().savePushPriorities(), false);assert.deepEqual(writes, []);
});
test('a newer read wins over a delayed earlier read', async () => {
  const first = deferred(), second = deferred();let count = 0;
  api.getPreferences = () => ++count === 1 ? first.promise : second.promise;
  const a = s().loadPushPriorities(), b = s().loadPushPriorities();
  second.resolve({ pushPriorities: { primary: 'low' } });await b;
  first.resolve({ pushPriorities: { primary: 'normal' } });assert.equal(await a, false);
  assert.equal(s().pushPriorities.primary, 'low');
});
test('a delayed full preference hydration never overwrites a saved priority', async () => {
  await s().loadPushPriorities();
  const old = deferred();api.getPreferences = () => old.promise;
  const hydration = s().loadPreferences();
  s().setPushPriority('newsletter', 'very-low');await s().savePushPriorities();
  old.resolve({ aiActions: [], pushPriorities: { newsletter: 'high' } });await hydration;
  assert.equal(s().pushPriorities.newsletter, 'very-low');
});
for (const action of ['load', 'save']) for (const returnToAlice of [false, true]) {
  test(`delayed ${action} cannot update a changed user, return=${returnToAlice}`, async () => {
    const pending = deferred();
    if (action === 'save') { await s().loadPushPriorities();s().setPushPriority('primary', 'low');api.savePreferences = () => pending.promise; }
    else api.getPreferences = () => pending.promise;
    const result = action === 'save' ? s().savePushPriorities() : s().loadPushPriorities();
    s().setUser({ id: 'bob' });if (returnToAlice) s().setUser({ id: 'alice' });
    pending.resolve({ pushPriorities: { primary: 'low' } });assert.equal(await result, false);
    assert.deepEqual(s().pushPriorities, normalizePushPriorities());
    assert.deepEqual(s().pushPriorityChanges, {});assert.equal(s().pushPrioritiesStatus, 'idle');
  });
}
test('a save is not duplicated or edited while pending and a read cannot replace it', async () => {
  await s().loadPushPriorities();s().setPushPriority('primary', 'normal');
  const pending = deferred();api.savePreferences = async patch => { writes.push(patch);await pending.promise; };
  const result = s().savePushPriorities();
  assert.equal(await s().savePushPriorities(), false);assert.equal(await s().loadPushPriorities(), false);
  s().setPushPriority('primary', 'low');pending.resolve();await result;
  assert.equal(writes.length, 1);assert.equal(s().pushPriorities.primary, 'normal');
});
test('locking invalidates a pending response but preserves edits for a retry after unlock', async () => {
  await s().loadPushPriorities();s().setPushPriority('automated', 'low');
  const pending = deferred();api.savePreferences = () => pending.promise;
  const result = s().savePushPriorities();s().setLocked(true);pending.resolve();assert.equal(await result, false);
  assert.equal(s().pushPriorities.automated, 'high');assert.deepEqual(s().pushPriorityChanges, { automated: 'low' });
  s().setLocked(false);await s().loadPushPriorities();api.savePreferences = async patch => { writes.push(patch);return { ok: true }; };
  assert.equal(await s().savePushPriorities(), true);assert.equal(s().pushPriorities.automated, 'low');
});
test('opening on another device reads the saved map and partial updates preserve other categories', async () => {
  await s().loadPushPriorities();s().setPushPriority('newsletter', 'low');await s().savePushPriorities();
  s().setUser(null);s().setUser({ id: 'alice' });await s().loadPushPriorities();
  assert.equal(s().pushPriorities.newsletter, 'low');
  server.pushPriorities.social = 'normal';
  s().setPushPriority('promotion', 'very-low');await s().savePushPriorities();await s().loadPushPriorities();
  assert.equal(s().pushPriorities.social, 'normal');assert.equal(s().pushPriorities.newsletter, 'low');
  assert.deepEqual(writes[1], { pushPriorities: { promotion: 'very-low' } });
});
for (const action of ['load', 'save']) {
  test(`a rejected old ${action} does not show an error for the next user`, async () => {
    const pending = deferred();
    if (action === 'save') { await s().loadPushPriorities();s().setPushPriority('primary', 'low');api.savePreferences = () => pending.promise; }
    else api.getPreferences = () => pending.promise;
    const old = action === 'save' ? s().savePushPriorities() : s().loadPushPriorities();
    s().setUser({ id: 'bob' });api.getPreferences = async () => ({ pushPriorities: { social: 'normal' } });await s().loadPushPriorities();
    pending.reject(Error('old user offline'));assert.equal(await old, false);
    assert.equal(s().pushPrioritiesStatus, 'ready');assert.equal(s().pushPriorities.social, 'normal');
  });
}
