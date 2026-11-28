import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { dismissReadNotifications } from './dismissReadNotifications.js';
import { api, CSRF_HEADER, CSRF_VALUE } from './api.js';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalFetch = globalThis.fetch;
const tick = () => new Promise(resolve => setImmediate(resolve));
const notice = messageId => ({ data: { messageId }, closed: false, close() { this.closed = true; } });
function registration(notifications) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: {
    getRegistration: async () => ({ getNotifications: async options => {
      assert.deepEqual(options, { tag: 'mailflow-new-mail' });
      return notifications;
    } }),
  } } });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
});

test('a successful read closes its notification only after the server confirms the current read flag', async () => {
  const one = notice('one'), other = notice('other'); registration([one, other]);
  let acceptRead, confirmFlag;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([url, init]);
    const body = await new Promise(resolve => { if (init.method === 'POST') acceptRead = resolve; else confirmFlag = resolve; });
    return { ok: true, json: async () => body };
  };
  const reading = api.bulkRead(['one'], true);
  assert.equal(one.closed, false);
  const response = { ok: true, updated: ['one'] };
  acceptRead(response); assert.equal(await reading, response);
  await tick(); assert.equal(one.closed, false, 'the flag query is still pending');
  confirmFlag({ id: 'one', is_read: true }); await tick();
  assert.equal(one.closed, true); assert.equal(other.closed, false);
  assert.deepEqual(calls.map(([url]) => url), ['/api/mail/messages/bulk-read', '/api/mail/messages/one']);
  for (const [, init] of calls) {
    assert.equal(init.credentials, 'include');
    assert.equal(init.headers[CSRF_HEADER], CSRF_VALUE);
  }
});

test('a refused read and marking unread do not dismiss notifications', async () => {
  const one = notice('one'); registration([one]);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 500, json: async () => ({ error: 'Failed' }) }; };
  await assert.rejects(api.bulkRead(['one'], true), /Failed/); await tick();
  assert.equal(one.closed, false); assert.equal(calls, 1);
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ ok: true }) }; };
  await api.bulkRead(['one'], false); await tick();
  assert.equal(one.closed, false); assert.equal(calls, 2);
});

test('reconciliation keeps unread, unknown and batch notifications and tolerates a failed lookup', async () => {
  const read = notice('read'), unread = notice('unread'), unknown = notice('unknown'), batch = notice(undefined);
  registration([read, unread, unknown, batch]);
  const lookedUp = [];
  await dismissReadNotifications(null, async id => {
    lookedUp.push(id);
    if (id === 'unknown') throw new Error('offline');
    return { is_read: id === 'read' };
  });
  assert.deepEqual(lookedUp, ['read', 'unread', 'unknown']);
  assert.equal(read.closed, true);
  assert.equal(unread.closed || unknown.closed || batch.closed, false);
});

test('unrelated reads and unsupported or rejected registration do not affect mail actions', async () => {
  const one = notice('one'); registration([one]);
  await dismissReadNotifications(['other'], () => { throw new Error('must not query'); });
  assert.equal(one.closed, false);
  navigator.serviceWorker.getRegistration = async () => { throw new Error('permission'); };
  await dismissReadNotifications(null, () => { throw new Error('must not query'); });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  await dismissReadNotifications(null, () => { throw new Error('must not query'); });
});

test('a read event closes its single notification and only fully read groups', async () => {
  const one = notice('one'), group = notice(undefined), legacy = notice(undefined);
  group.data.messageIds = ['one', 'two'];
  registration([one, group, legacy]);
  let twoRead = false;
  const lookedUp = [];
  const lookup = async id => {
    lookedUp.push(id);
    return { is_read: id === 'one' || twoRead };
  };
  await dismissReadNotifications(['one'], lookup, { confirmed: true });
  assert.equal(one.closed, true);
  assert.equal(group.closed, false);
  assert.deepEqual(lookedUp, ['two']);
  twoRead = true;
  await dismissReadNotifications(['two'], lookup, { confirmed: true });
  assert.equal(group.closed, true);
  assert.equal(legacy.closed, false);
});

test('mark all read reconciles only server-confirmed read notifications', async () => {
  const one = notice('one'), other = notice('other'); registration([one, other]);
  globalThis.fetch = async (url) => ({ ok: true, json: async () => url.endsWith('/one') ? { is_read: true } : { is_read: false } });
  await api.markAllRead('account', 'INBOX'); await tick();
  assert.equal(one.closed, true); assert.equal(other.closed, false);
});
