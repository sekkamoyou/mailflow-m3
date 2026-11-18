import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { transform } from 'sucrase';
import { JSDOM } from 'jsdom';
registerHooks({ load(url, context, next) {
  if (url.endsWith('react-i18next/dist/es/index.js') || url.endsWith('/react-i18next')) return { format: 'module', shortCircuit: true, source: 'export const useTranslation=()=>({t:k=>k,i18n:{language:"en",changeLanguage(){}}});export const initReactI18next={type:"3rdParty",init(){}};export const Trans=({children})=>children??null;' };
  if (url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
  if (url.endsWith('.jsx')) return { format: 'module', shortCircuit: true, source: transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic', filePath: url }).code.replaceAll('import.meta.env', 'globalThis.__VITE_ENV__') };
  if (url.startsWith('file:') && url.endsWith('.js')) {
    const code = readFileSync(new URL(url), 'utf8');
    if (code.includes('import.meta.env')) return { format: 'module', shortCircuit: true, source: code.replaceAll('import.meta.env', 'globalThis.__VITE_ENV__') };
  }
  return next(url, context);
} });
const dom = new JSDOM('<div id="root"></div>', { url: 'https://mail.example.invalid', pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  Image: dom.window.Image, CustomEvent: dom.window.CustomEvent, Node: dom.window.Node, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true, __VITE_ENV__: { MODE: 'test', PROD: true } });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.matchMedia = window.matchMedia;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { useStore } = await import('../store/index.js');
const { api } = await import('../utils/api.js');
const Section = (await import('./PushPrioritiesSection.jsx')).default;
const AdminPanel = (await import('./AdminPanel.jsx')).default;
const host = document.getElementById('root');
const state = () => useStore.getState();
let root, server, calls, failLoad, failSave;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
beforeEach(() => {
  useStore.setState({ user: null, isLocked: false });state().setUser({ id: 'alice' });
  server = { categorizationEnabled: false };calls = [];failLoad = false;failSave = false;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), method, body, headers: init.headers, credentials: init.credentials });
    if (url === '/api/auth/preferences') {
      if (method === 'GET') return failLoad ? json({ error: 'offline' }, 503) : json(server);
      if (failSave) return json({ error: 'offline' }, 503);
      server.pushPriorities = { ...server.pushPriorities, ...body.pushPriorities };return json({ ok: true });
    }
    return json({});
  };
});
afterEach(async () => { await React.act(async () => root?.unmount());root = null;state().setUser(null); });
const mount = async (Component = Section) => React.act(async () => { root = createRoot(host);root.render(React.createElement(Component)); });
const click = async el => React.act(async () => el.click());
const selects = () => [...host.querySelectorAll('.material-push-priorities select')];
const button = key => [...host.querySelectorAll('button')].find(el => el.textContent === key);
const writes = () => calls.filter(c => c.method === 'PATCH');
async function choose(index, value) {
  await React.act(async () => { const select = selects()[index];select.value = value;select.dispatchEvent(new window.Event('change', { bubbles: true })); });
}

test('five named native selects start high and offer exactly four priorities without auto-saving', async () => {
  await mount();
  assert.equal(selects().length, 5);
  assert.deepEqual(selects().map(s => s.value), ['high', 'high', 'high', 'high', 'high']);
  for (const select of selects()) {
    assert.ok(select.closest('label').querySelector('span').textContent.startsWith('messageList.categories.'));
    assert.deepEqual([...select.options].map(o => o.value), ['high', 'normal', 'low', 'very-low']);
  }
  assert.equal(button('common.save').disabled, true);assert.deepEqual(writes(), []);
});
test('explicit Save patches only changed categories with the existing cookie/CSRF API contract', async () => {
  await mount();await choose(1, 'normal');await choose(2, 'low');
  assert.deepEqual(writes(), []);await click(button('common.save'));
  assert.deepEqual(writes().map(w => w.body), [{ pushPriorities: { newsletter: 'normal', promotion: 'low' } }]);
  assert.equal(writes()[0].headers['X-Requested-With'], 'MailFlow');assert.equal(writes()[0].credentials, 'include');
  assert.ok(host.querySelector('[role=status]').textContent.includes('admin.pushPriorities.saved'));
  assert.equal(button('common.save').disabled, true);
});
test('load failure shows an error and retry, without editable default values', async () => {
  failLoad = true;await mount();assert.ok(host.querySelector('[role=alert]'));assert.equal(selects().length, 0);
  failLoad = false;server.pushPriorities = { newsletter: 'low' };await click(button('common.retry'));
  assert.equal(selects()[1].value, 'low');assert.deepEqual(writes(), []);
});
test('save failure keeps edits visible and retry confirms them', async () => {
  await mount();await choose(4, 'very-low');failSave = true;await click(button('common.save'));
  assert.ok(host.querySelector('[role=alert]').textContent.includes('admin.pushPriorities.saveError'));
  assert.equal(selects()[4].value, 'very-low');failSave = false;await click(button('common.retry'));
  assert.deepEqual(writes().map(w => w.body), [{ pushPriorities: { social: 'very-low' } }, { pushPriorities: { social: 'very-low' } }]);
  assert.equal(host.querySelector('[role=alert]'), null);
});
test('classification off links to the existing Categories settings without changing activation', async () => {
  await mount();assert.ok(host.textContent.includes('admin.pushPriorities.categoriesOff'));
  await click(button('admin.tabs.categories'));assert.equal(state().adminTab, 'categories');
  assert.equal(state().categorizationEnabled, false);assert.deepEqual(writes(), []);
  await React.act(async () => useStore.setState({ categorizationEnabled: true }));
  assert.ok(!host.textContent.includes('admin.pushPriorities.categoriesOff'));
  assert.ok(host.textContent.includes('admin.pushPriorities.deliveryHint'));
  assert.ok(host.textContent.includes('admin.pushPriorities.batchHint'));
});
test('an unmount and remount retain unsaved changes for the same user', async () => {
  await mount();await choose(1, 'normal');
  await React.act(async () => root.unmount());root = null;await mount();
  assert.equal(selects()[1].value, 'normal');assert.deepEqual(writes(), []);assert.equal(button('common.save').disabled, false);
});
test('controls stay disabled during Save and a remount shows its result without a second request', async () => {
  await mount();await choose(2, 'low');
  const pending = deferred(), original = api.savePreferences;
  api.savePreferences = () => pending.promise;
  try {
    await click(button('common.save'));assert.ok(selects().every(s => s.disabled));
    await React.act(async () => root.unmount());root = null;await mount();assert.equal(selects()[2].value, 'low');
    await React.act(async () => pending.resolve({ ok: true }));assert.ok(host.textContent.includes('admin.pushPriorities.saved'));
    assert.equal(selects()[2].value, 'low');assert.ok(selects().every(s => !s.disabled));
  } finally { api.savePreferences = original; }
});
test('changing users clears old edits immediately and ignores the late save response', async () => {
  await mount();await choose(1, 'low');
  const pending = deferred(), original = api.savePreferences;api.savePreferences = () => pending.promise;
  try {
    await click(button('common.save'));
    server = { pushPriorities: { primary: 'normal' } };
    await React.act(async () => state().setUser({ id: 'bob' }));
    assert.equal(selects()[0].value, 'normal');assert.equal(selects()[1].value, 'high');
    await React.act(async () => pending.resolve({ ok: true }));
    assert.equal(selects()[0].value, 'normal');assert.equal(selects()[1].value, 'high');
    assert.ok(!host.textContent.includes('admin.pushPriorities.saved'));
  } finally { api.savePreferences = original; }
});
test('Notifications settings contain the priority section next to browser push controls', async () => {
  useStore.setState({ showAdmin: true, adminTab: 'notifications', accounts: [] });
  await mount(AdminPanel);assert.ok(host.querySelector('.material-push-priorities'));assert.equal(selects().length, 5);
  assert.ok(host.textContent.includes('admin.push.title'));
});
