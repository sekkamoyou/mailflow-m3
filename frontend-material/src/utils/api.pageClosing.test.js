// A request sent while the page closes is keepalive, so it completes after the page is gone; the
// flag clears again for a page restored from the back-forward cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window ?? { dispatchEvent() {}, location: { origin: 'https://mail.example' } };
const seen = [];
globalThis.fetch = async (url, opts) => { seen.push(opts); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
const { api, setPageClosing } = await import('./api.js');

test('requests sent while the page closes are keepalive, and only then', async () => {
  await api.bulkArchive(['a']);
  setPageClosing(true);
  await api.bulkArchive(['b']);
  setPageClosing(false);
  await api.bulkArchive(['c']);
  assert.deepEqual(seen.map(o => o.keepalive === true), [false, true, false]);
});

test('scheduled attachments use the existing protected binary endpoint and preserve all bytes', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, opts) => { request = { url, opts }; return new Response(new Uint8Array([0, 255, 128])); };
  try {
    assert.equal(await api.scheduled.attachmentBase64('scheduled/id', 2), 'AP+A');
    assert.equal(request.url, '/api/mail/scheduled/scheduled%2Fid/attachments/2');
    assert.equal(request.opts.credentials, 'include');
    assert.equal(request.opts.headers['X-Requested-With'], 'MailFlow');
    assert.equal(request.opts.keepalive, undefined, 'attachment bodies do not share the closing-page budget');
  } finally { globalThis.fetch = original; }
});

test('scheduled attachment refusals keep the lock and session-expiry screens', async () => {
  const originalFetch = globalThis.fetch;
  const originalDispatch = window.dispatchEvent;
  const events = [];
  window.dispatchEvent = event => events.push(event.type);
  try {
    for (const status of [423, 401]) {
      globalThis.fetch = async () => ({ ok: false, status });
      await assert.rejects(api.scheduled.attachmentBase64('scheduled', 0), error => error.status === status);
    }
    assert.deepEqual(events, ['mailflow:locked', 'mailflow:session_expired']);
  } finally { globalThis.fetch = originalFetch; window.dispatchEvent = originalDispatch; }
});
