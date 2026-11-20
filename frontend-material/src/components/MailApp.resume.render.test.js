// Render test for what MailApp does when the tab comes back to the front.
//
// installResumeRefresh (utils/resumeRefresh.js) decides when a returning tab resynchronises: not
// for a glance, once for a real absence however many signals it fires. MailApp also kept an older
// visibilitychange listener that dispatched mailflow:refresh on every return, so a glance at the
// app switcher still reloaded the list and a real resume reloaded it twice.
//
// A resume often comes before the network does, so its requests fail; that resync has to be
// tried again rather than spent.
//
// MailApp is mounted for real with its children stubbed: the question is only which refreshes
// its own effects ask for.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { transform } from 'sucrase';

const STUBS = {
  '/components/Sidebar.jsx': 'import React from "react"; export default function Sidebar({ expandedRail }) { return React.createElement("div", { "data-expanded-rail": expandedRail ? "true" : undefined }); }',
  '/components/MessageList.jsx': 'import React from "react"; export default function MessageList() { return React.createElement("div", { "data-list-stub": "" }); }',
  '/components/ReadingPane.jsx': 'import React from "react"; export default function ReadingPane() { return React.createElement("div", { "data-reader-stub": "" }); }',
  '/components/NotificationToasts.jsx': 'export default function NotificationToasts() { return null; }',
  '/components/CommandPalette.jsx': 'export default function CommandPalette() { return null; }',
  '/components/ComposeModal.jsx': 'export default function ComposeModal() { return null; }',
  '/components/ContactsPage.jsx': 'export default function ContactsPage() { return null; }',
  '/components/WindowLayer.jsx': 'export default function WindowLayer() { return null; }',
  '/components/AdminPanel.jsx': 'export default function AdminPanel() { return null; }',
  '/components/ElectronNotificationBridge.jsx': 'export default function ElectronNotificationBridge() { return null; }',
  '/components/InboxReplyDraftObserver.js': 'export default function InboxReplyDraftObserver() { return null; }',
  '/plugins/PluginSlot.jsx': 'export const usePluginSlot = () => []; export const usePluginCollected = () => []; export function PluginSlot() { return null; } export function PluginRuntime() { return null; }',
  // An open socket, so the fallback list refresh for a socket that is down stays quiet.
  '/hooks/useWebSocket.js': 'export const useWebSocket = () => ({ current: { readyState: 1 } });',
};

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('react-i18next/dist/es/index.js') || url.endsWith('/react-i18next')) {
      return { format: 'module', shortCircuit: true, source: [
        'export const useTranslation = () => ({ t: (k) => k, i18n: { language: "en", changeLanguage: () => {} } });',
        'export const initReactI18next = { type: "3rdParty", init: () => {} };',
        'export const Trans = ({ children }) => children ?? null;',
        'export const I18nextProvider = ({ children }) => children ?? null;',
        'export default { useTranslation, initReactI18next };',
      ].join('\n') };
    }
    const stub = Object.keys(STUBS).find(path => url.endsWith(path));
    if (stub) return { format: 'module', shortCircuit: true, source: STUBS[stub] };
    if (url.endsWith('.json')) {
      return { format: 'module', shortCircuit: true, source: `export default ${readFileSync(new URL(url), 'utf8')}` };
    }
    const shimViteEnv = (code) => code.replaceAll('import.meta.env', 'globalThis.__VITE_ENV__');
    if (url.endsWith('.jsx')) {
      const out = transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic', filePath: url });
      return { format: 'module', shortCircuit: true, source: shimViteEnv(out.code) };
    }
    if (url.startsWith('file:') && url.endsWith('.js')) {
      const code = readFileSync(new URL(url), 'utf8');
      if (code.includes('import.meta.env')) return { format: 'module', shortCircuit: true, source: shimViteEnv(code) };
    }
    return nextLoad(url, context);
  },
});

const dom = new JSDOM('<div id="root"></div>', { url: 'https://mail.example.invalid/', pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  history: dom.window.history,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  CustomEvent: dom.window.CustomEvent, Event: dom.window.Event,
  Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
  getComputedStyle: dom.window.getComputedStyle,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.matchMedia = dom.window.matchMedia;
globalThis.__VITE_ENV__ = { MODE: 'test', DEV: false, PROD: true };
globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}), text: async () => '{}' });

let visibility = 'visible';
Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, get: () => visibility });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { api } = await import('../utils/api.js');
const { useStore } = await import('../store/index.js');
const { RESUME_RETRY_MS } = await import('../utils/resumeRefresh.js');
const MailApp = (await import('./MailApp.jsx')).default;

const original = { ...api, todoist: api.todoist };
let root;
let refreshes;
let countsFail;
const countRefresh = () => { refreshes += 1; };

beforeEach(async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  Object.assign(api, {
    getAccounts: async () => [],
    getUnreadCounts: async () => {
      if (countsFail) throw new Error('Failed to fetch');
      return { total: 0, byAccount: {}, snapshots: {}, complete: true };
    },
    getFolders: async () => [],
    todoist: { ...original.todoist, status: async () => ({ connected: false }) },
  });
  useStore.setState({ isLocked: false });
  refreshes = 0;
  countsFail = false;
  visibility = 'visible';
  root = createRoot(document.getElementById('root'));
  await React.act(async () => { root.render(React.createElement(MailApp)); });
  dom.window.addEventListener('mailflow:refresh', countRefresh);
});

afterEach(async () => {
  dom.window.removeEventListener('mailflow:refresh', countRefresh);
  await React.act(async () => root.unmount());
  Object.assign(api, original);
});

async function hideFor(t, ms) {
  visibility = 'hidden';
  document.dispatchEvent(new dom.window.Event('visibilitychange'));
  t.mock.timers.tick(ms);
  visibility = 'visible';
  await React.act(async () => { document.dispatchEvent(new dom.window.Event('visibilitychange')); });
}

describe('MailApp: returning to the tab', () => {
  test('a glance at the app switcher does not reload the list', async (t) => {
    await hideFor(t, 1000);
    assert.equal(refreshes, 0);
  });

  test('coming back after a real absence reloads the list once', async (t) => {
    await hideFor(t, 10 * 60_000);
    assert.equal(refreshes, 1);
  });

  test('a resume that comes back before the network does is tried again', async (t) => {
    countsFail = true;
    await hideFor(t, 10 * 60_000);
    assert.equal(refreshes, 1);
    countsFail = false;
    await React.act(async () => { t.mock.timers.tick(RESUME_RETRY_MS[0]); });
    assert.equal(refreshes, 2, 'the list is asked for again');
    await React.act(async () => { t.mock.timers.tick(60_000); });
    assert.equal(refreshes, 2, 'and only until it works');
  });
});

test('compact views have two primary destinations, the medium rail adds settings and folders, and desktop expands the rail', async () => {
  const width = window.innerWidth;
  const mountAt = async width => {
    await React.act(async () => root.render(null));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    await React.act(async () => root.render(React.createElement(MailApp)));
  };
  try {
    await mountAt(416);
    const bar = '.material-app-inner[data-primary-view] > .material-navigation[data-layout=bar]';
    assert.equal(document.querySelectorAll(bar + ' button').length, 2);
    assert.equal(Boolean(document.querySelector('.material-app-header')), false);
    await React.act(async () => useStore.getState().setSelectedMessage('reader-message'));
    assert.equal(Boolean(document.querySelector(bar)), false);
    await React.act(async () => useStore.getState().setSelectedMessage(null));

    await mountAt(700);
    const rail = '.material-workspace > .material-navigation[data-layout=rail]';
    assert.equal(document.querySelectorAll(rail + ' button').length, 4);
    assert.equal(Boolean(document.querySelector(rail + ' [aria-controls=material-folder-pane]')), true);

    await mountAt(1280);
    assert.equal(Boolean(document.querySelector(rail)), false);
    assert.equal(Boolean(document.querySelector('#material-folder-pane [data-expanded-rail=true]')), true);
    assert.equal(Boolean(document.querySelector('.material-app-header [aria-controls=material-folder-pane]')), true);
  } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); }
});

test('desktop List first keeps the list mounted and returns with Back or Escape without consuming dialog Escape', async () => {
  const previousLayout = useStore.getState().layout;
  const back = history.back;
  let backs = 0;
  history.back = () => { backs += 1; };
  try {
    await React.act(async () => useStore.setState({ layout: 'list', selectedMessageId: null, composing: false, showAdmin: false }));
    const list = document.querySelector('[data-list-stub]');
    const reader = document.querySelector('[data-reader-stub]');
    assert.equal(list.parentElement.style.display, 'flex');
    assert.equal(reader.parentElement.style.display, 'none');
    await React.act(async () => useStore.getState().setSelectedMessage('m-list'));
    assert.equal(history.state.mailflow, 'message');
    assert.ok(list === document.querySelector('[data-list-stub]'));
    assert.equal(list.parentElement.style.display, 'none');
    assert.equal(reader.parentElement.style.display, 'flex');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog.remove();
    assert.equal(backs, 0, 'a menu or dialog owns Escape');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(backs, 1);
    history.replaceState({}, '');
    await React.act(async () => window.dispatchEvent(new window.PopStateEvent('popstate', { state: {} })));
    assert.equal(useStore.getState().selectedMessageId, null);
    assert.ok(list === document.querySelector('[data-list-stub]'));
    assert.equal(list.parentElement.style.display, 'flex');
    await React.act(async () => useStore.getState().setSelectedMessage('restored-list'));
    history.replaceState({}, '');
    await React.act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(backs, 1, 'without an app history entry Escape closes directly');
    assert.equal(useStore.getState().selectedMessageId, null);
  } finally {
    history.back = back;
    await React.act(async () => useStore.setState({ layout: previousLayout, selectedMessageId: null }));
  }
});

test('mobile history returns from a message to search, then exits search without replacing the PWA guard', async () => {
  const width = window.innerWidth;
  const standalone = window.navigator.standalone;
  try {
    await React.act(async () => root.render(null));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 416 });
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });
    window.history.replaceState({ mailflow: 'guard' }, '');
    useStore.setState({ selectedMessageId: null, mobileSearchOpen: false, searchQuery: '' });
    await React.act(async () => root.render(React.createElement(MailApp)));
    await React.act(async () => useStore.getState().setMobileSearchOpen(true));
    assert.equal(window.history.state.mailflow, 'search');
    await React.act(async () => useStore.getState().setSearchQuery('invoice'));
    await React.act(async () => useStore.setState({ selectedMessageId: 'search-result' }));
    assert.equal(window.history.state.mailflow, 'message');
    window.history.replaceState({ mailflow: 'search' }, '');
    const length = window.history.length;
    await React.act(async () => window.dispatchEvent(new window.PopStateEvent('popstate', { state: { mailflow: 'search' } })));
    assert.equal(useStore.getState().selectedMessageId, null);
    assert.equal(useStore.getState().mobileSearchOpen, true);
    assert.equal(useStore.getState().searchQuery, 'invoice');
    assert.equal(window.history.length, length, 'return to search must not push another guard');
    window.history.replaceState({ mailflow: 'guard' }, '');
    await React.act(async () => window.dispatchEvent(new window.PopStateEvent('popstate', { state: { mailflow: 'guard' } })));
    assert.equal(useStore.getState().mobileSearchOpen, false);
    assert.equal(useStore.getState().searchQuery, '');
    await React.act(async () => useStore.getState().setMobileSearchOpen(true));
    await React.act(async () => useStore.getState().setSearchQuery('native back'));
    const back = window.history.back;
    let consumed = false;
    window.history.back = () => { consumed = true; };
    try {
      await React.act(async () => assert.equal(window.__mailflowHandleAndroidBack(), true));
      assert.equal(consumed, true);
      assert.equal(useStore.getState().mobileSearchOpen, false);
      assert.equal(useStore.getState().searchQuery, '');
    } finally { window.history.back = back; }
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: standalone });
    await React.act(async () => useStore.setState({ selectedMessageId: null, mobileSearchOpen: false, searchQuery: '' }));
  }

});

describe('MailApp: the account list', () => {
  // A load that failed (the server restarting under a deploy) left the app with no accounts
  // until the page was reloaded.
  test('a failed load is tried again until it works', async (t) => {
    await React.act(async () => root.unmount());
    let calls = 0;
    const ACCOUNT = { id: 'acct-1', email_address: 'a@example.com', name: 'A' };
    api.getAccounts = async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('Failed to fetch'), { status: 502 });
      return [ACCOUNT];
    };
    const error = t.mock.method(console, 'error', () => {});
    useStore.setState({ accounts: [], accountsReady: false });
    root = createRoot(document.getElementById('root'));
    await React.act(async () => { root.render(React.createElement(MailApp)); });
    assert.equal(calls, 1);
    assert.equal(useStore.getState().accountsReady, true, 'the list does not wait on it');
    await React.act(async () => { t.mock.timers.tick(2000); });
    assert.equal(calls, 2);
    await React.act(async () => { t.mock.timers.tick(5000); });
    assert.equal(calls, 3);
    assert.deepEqual(useStore.getState().accounts.map(a => a.id), ['acct-1']);
    await React.act(async () => { t.mock.timers.tick(120_000); });
    assert.equal(calls, 3, 'and not again once it worked');
    assert.ok(error.mock.callCount() >= 2);
  });

  test('a signed-out answer is not retried', async (t) => {
    await React.act(async () => root.unmount());
    let calls = 0;
    api.getAccounts = async () => { calls += 1; throw Object.assign(new Error('Unauthorized'), { status: 401 }); };
    t.mock.method(console, 'error', () => {});
    root = createRoot(document.getElementById('root'));
    await React.act(async () => { root.render(React.createElement(MailApp)); });
    await React.act(async () => { t.mock.timers.tick(120_000); });
    assert.equal(calls, 1);
  });
});

test('an account response arriving after the mail view unmounts cannot replace the next view accounts', async () => {
  await React.act(async () => root.unmount());
  let answer;
  api.getAccounts = () => new Promise(resolve => { answer = resolve; });
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(MailApp)));
  await React.act(async () => root.unmount());
  useStore.setState({ accounts: [{ id: 'current-account' }] });
  await React.act(async () => answer([{ id: 'stale-account' }]));
  assert.deepEqual(useStore.getState().accounts.map(a => a.id), ['current-account']);
  root = createRoot(document.getElementById('root'));
});
