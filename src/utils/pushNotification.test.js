import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://mail.example.invalid';
const AVATAR = '/api/notification-avatar/test-capability';
function worker(fetchImpl = async () => new Response('png', { headers: { 'content-type': 'image/png' } }), timers = {}) {
  const handlers = {}, shown = [], requests = [], badges = [];
  const self = {
    location: { origin: ORIGIN }, addEventListener: (name, fn) => { handlers[name] = fn; },
    clients: { matchAll: async () => [] },
    navigator: { setAppBadge: async n => { badges.push(n); }, clearAppBadge: async () => { badges.push(0); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, ...options }); } },
  };
  runInNewContext(source, { self, URL, AbortController, setTimeout, clearTimeout, ...timers, fetch: (...args) => { requests.push(args); return fetchImpl(...args); } });
  return { shown, requests, badges, push: data => { let promise;handlers.push({ data: { json: () => data }, waitUntil: value => { promise = value; } });return promise; } };
}

test('closed PWA displays a sender avatar with a versioned app badge, count and deep link', async () => {
  const w = worker();await w.push({ avatar: AVATAR, icon: '/icon-512.png', badge: '/badge-96.png', title: 'Sender', body: 'Subject', url: '/?m=one', unreadCount: 4 });
  assert.equal(w.shown.length, 1);const n = w.shown[0];
  assert.equal(n.icon, ORIGIN + AVATAR);assert.equal(n.badge, '/badge-96.png?v=material-2');
  assert.equal(n.title, 'Sender');assert.equal(n.body, 'Subject');assert.equal(n.data.url, '/?m=one');
  assert.equal(n.renotify, true);assert.equal(n.tag, 'mailflow-new-mail');assert.deepEqual(w.badges, [4]);
  assert.equal(w.requests[0][1].credentials, 'omit');assert.equal(w.requests[0][1].cache, 'no-store');
});

test('cache miss, expired authorization, invalid image and network failure omit the avatar without dropping the notification', async () => {
  for (const response of [new Response('', { status: 404 }), new Response('', { status: 401 }), new Response('<html>', { headers: { 'content-type': 'text/html' } }), null]) {
    const w = worker(async () => { if (!response) throw new Error('offline');return response; });
    await w.push({ avatar: AVATAR, icon: '/icon-512.png' });
    assert.equal(w.shown.length, 1);assert.equal(Object.hasOwn(w.shown[0], 'icon'), false);
    assert.equal(w.shown[0].badge, '/badge-96.png?v=material-2');
  }
});

test('a slow image aborts after 1500ms and still shows the notification', async () => {
  let expire, delay;
  const w = worker((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), {
    setTimeout: (fn, ms) => { expire = fn;delay = ms;return 1; }, clearTimeout: () => {},
  });
  const promise = w.push({ avatar: AVATAR });await new Promise(resolve => setImmediate(resolve));
  assert.equal(delay, 1500);expire();await promise;
  assert.equal(Object.hasOwn(w.shown[0], 'icon'), false);
});

test('ignores external URLs, unrelated APIs and malformed avatar metadata', async () => {
  for (const avatar of ['https://outside.example/track', '/api/contacts/photo?email=x', '/api/notification-avatar/../contacts/photo', {}, null]) {
    const w = worker();await w.push({ avatar });
    assert.equal(w.requests.length, 0);assert.equal(w.shown.length, 1);
    assert.equal(Object.hasOwn(w.shown[0], 'icon'), false);
  }
});

test('pushes without an avatar omit even a supplied fallback icon and preserve badge counts', async () => {
  const w = worker();await w.push({ icon: '/icon-512.png' });
  assert.equal(w.requests.length, 0);assert.equal(Object.hasOwn(w.shown[0], 'icon'), false);
  assert.equal(w.shown[0].badge, '/badge-96.png?v=material-2');
  assert.deepEqual(w.badges, []);
  await w.push({ unreadCount: 0 });assert.deepEqual(w.badges, [0]);
});
