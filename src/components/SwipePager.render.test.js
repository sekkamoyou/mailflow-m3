import { test, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { transform } from 'sucrase';

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

const dom = new JSDOM('<div id="root"></div>', { url: 'https://mail.example.invalid', pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
  Image: dom.window.Image,
  CustomEvent: dom.window.CustomEvent, Node: dom.window.Node, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.Element.prototype.scrollIntoView = () => {};
globalThis.requestAnimationFrame ??= cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame ??= id => clearTimeout(id);
globalThis.__VITE_ENV__ = { MODE: 'test', DEV: false, PROD: true };

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { useStore } = await import('../store/index.js');
const { api } = await import('../utils/api.js');
const { bodyCache } = await import('../utils/bodyCache.js');
const { prefetchSwipeConversation, takeSwipeConversation } = await import('../utils/swipeConversation.js');
const SwipePager = (await import('./SwipePager.jsx')).default;
const SwipeMessagePreview = (await import('./SwipeMessagePreview.jsx')).default;
const { shortcutBus } = await import('../utils/shortcutBus.js');
const rows = ['A', 'B', 'C', 'D'].map(id => ({ id, account_id: 'acct', subject: `Subject ${id}`, from_name: `Sender ${id}`, from_email: `${id}@example.invalid`, date: '2026-11-06T00:00:00Z', is_read: false, folder: 'INBOX', to_addresses: [] }));
let root;
let reads;
let user = 0;
const wait = ms => React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
beforeEach(async () => {
  reads = [];
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  useStore.setState({ user: { id: `preview-${++user}` }, accounts: [{ id: 'acct', enabled: true }], messages: rows, selectedMessageId: 'B', conversationMode: 'off', searchQuery: '', selectedFolder: 'INBOX', selectedAccountId: 'acct', markReadBehavior: 'instant' });
  for (const row of rows) bodyCache.set(row.id, { html: `<h1>Actual body ${row.id}</h1>`, text: '', attachments: [] });
  api.bulkRead = async (...args) => { reads.push(args); return {}; };
  root = createRoot(document.getElementById('root'));
});
afterEach(async () => { await React.act(async () => root.unmount()); });

async function pager(onNavigate, extra = {}) {
  await React.act(async () => root.render(React.createElement(SwipePager, { enabled: true, prev: rows[0], next: rows[2], navKey: 'B', onNavigate, ...extra }, React.createElement('div', null, 'Current B'))));
  const el = document.querySelector('[data-swipe-pager]');
  assert.equal(el.style.scrollSnapType, 'x mandatory', 'recentring never leaves snapping disabled while animation frames are delayed');
  Object.defineProperty(el, 'clientWidth', { value: 416 });
  for (const child of el.children) Object.defineProperty(child, 'offsetLeft', { get: () => [...el.children].indexOf(child) * 416 });
  await wait(45);
  el.scrollLeft = extra.prev === null ? 0 : 416;
  return el;
}
const event = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));

test('native scroll does not select a neighbor while a finger is held at its page edge', async () => {
  const moved = [];
  const el = await pager(dir => { moved.push(dir); return true; });
  await React.act(async () => {
    event(el, 'touchstart');
    el.scrollLeft = 832;
    event(el, 'scroll');
  });
  await wait(100);
  assert.deepEqual(moved, []);
  await React.act(async () => { event(el, 'touchend'); event(el, 'scrollend'); });
  assert.deepEqual(moved, ['next']);
  await React.act(async () => { event(el, 'scrollend'); event(el, 'scrollend'); });
  assert.deepEqual(moved, ['next'], 'the same completed scroll cannot open two rows');
});

test('the previous row is opened once at the list end', async () => {
  const moved = [];
  const el = await pager(dir => { moved.push(dir); return true; }, { next: null });
  await React.act(async () => { el.scrollLeft = 0; event(el, 'scrollend'); event(el, 'scrollend'); });
  assert.deepEqual(moved, ['prev']);
});

test('a declined navigation recenters and nested scrollend cannot commit a horizontal swipe', async () => {
  const moved = [];
  const el = await pager(dir => { moved.push(dir); return false; });
  await React.act(async () => { el.scrollLeft = 832; event(el.children[1].firstElementChild, 'scrollend'); });
  assert.deepEqual(moved, []);
  await React.act(async () => event(el, 'scrollend'));
  assert.deepEqual(moved, ['next']);
  await wait(45);
  assert.equal(el.scrollLeft, 416);
});

test('neighbors show the actual cached body and shared sender header without marking them read', async () => {
  await pager(() => true);
  const next = document.querySelector('[data-swipe-peek="next"]');
  assert.ok(next.textContent.includes('Subject C'));
  assert.ok(next.textContent.includes('Sender C'));
  assert.ok(next.querySelector('iframe').srcdoc.includes('Actual body C'));
  assert.equal(next.querySelectorAll('.skeleton-line').length, 0);
  assert.ok(next.querySelector('[inert]'), 'preview controls are outside the interaction/focus tree');
  assert.deepEqual(reads, []);
  assert.equal(useStore.getState().messages.find(m => m.id === 'C').is_read, false);
});

test('a conversation preview renders real cards without read or selected-message shortcuts', async () => {
  const row = { ...rows[2], thread_id: 'tC', message_count: 2 };
  api.getThread = async () => ({ messages: [{ ...row, id: 'C-old', date: '2026-11-05T00:00:00Z' }, row] });
  useStore.setState({ conversationMode: 'pane' });
  await React.act(async () => root.render(React.createElement(SwipeMessagePreview, { row })));
  await wait(30);
  assert.deepEqual([...document.querySelectorAll('[data-message-id]')].map(el => el.dataset.messageId), ['C-old', 'C']);
  assert.ok(document.querySelector('iframe').srcdoc.includes('Actual body C'));
  shortcutBus.emit('loadRemoteImages');
  shortcutBus.emit('unsubscribe');
  await wait(10);
  assert.deepEqual(reads, []);
});

test('a grouped preview uses the row message own header and opens the newest in-account conversation card', async () => {
  const row = { ...rows[2], thread_id: 'newest-preview', reply_from_name: 'Actual sender', reply_from_email: 'actual@example.invalid', reply_subject: 'Actual subject' };
  await React.act(async () => root.render(React.createElement(SwipeMessagePreview, { row })));
  assert.ok(document.body.textContent.includes('Actual sender'));
  assert.ok(document.body.textContent.includes('Actual subject'));
  const latest = { ...row, id: 'C-latest', folder: 'Sent', date: '2026-11-07T00:00:00Z', is_read: true };
  api.getThread = async () => ({ messages: [{ ...row, is_read: true }, latest, { ...latest, id: 'other-account', account_id: 'other', date: '2026-11-08T00:00:00Z' }] });
  bodyCache.set(latest.id, { html: '<h1>Newest in-account body</h1>', attachments: [] });
  await React.act(async () => useStore.setState({ conversationMode: 'pane' }));
  await wait(30);
  const expanded = [...document.querySelectorAll('[data-message-id]')].filter(card => card.querySelector('[aria-expanded="true"]'));
  assert.deepEqual(expanded.map(card => card.dataset.messageId), ['C-latest']);
  assert.ok(document.querySelector('iframe').srcdoc.includes('Newest in-account body'));
  assert.deepEqual(reads, []);
});

test('prefetched conversations are scoped, deduplicated, bounded and consumed on opening', async () => {
  let calls = 0;
  api.getThread = async id => { calls++; return { messages: [{ id }] }; };
  const entry = prefetchSwipeConversation('t', 'INBOX', false);
  assert.equal(prefetchSwipeConversation('t', 'INBOX', false), entry);
  await entry.promise;
  assert.deepEqual(entry.data.messages, [{ id: 't' }]);
  assert.equal(takeSwipeConversation('t', 'Other', false), null);
  assert.equal(takeSwipeConversation('t', 'INBOX', true), null);
  assert.equal(takeSwipeConversation('t', 'INBOX', false), entry);
  assert.equal(takeSwipeConversation('t', 'INBOX', false), null);
  assert.equal(calls, 1);
  for (const id of ['one', 'two', 'three', 'four']) await prefetchSwipeConversation(id, 'INBOX', false).promise;
  assert.equal(takeSwipeConversation('one', 'INBOX', false), null);
  assert.ok(takeSwipeConversation('four', 'INBOX', false));
});

test('a user change clears prefetched mail and rejects a previous user response', async () => {
  let resolve;
  api.getThread = () => new Promise(done => { resolve = done; });
  const entry = prefetchSwipeConversation('private', 'INBOX', false);
  const rejected = assert.rejects(entry.promise, /User changed/);
  useStore.setState({ user: { id: 'next-user' } });
  resolve({ messages: [{ id: 'private' }] });
  await rejected;
  assert.equal(takeSwipeConversation('private', 'INBOX', false), null);
  assert.equal(entry.data, null);
});

test('a prefetched conversation opens directly in StrictMode with its own cards and a single fetch', async () => {
  const row = { ...rows[2], thread_id: 'strict-thread' };
  let calls = 0;
  api.getThread = async () => { calls++; return { messages: [row] }; };
  await prefetchSwipeConversation(row.thread_id, 'INBOX', false).promise;
  const ConversationPane = (await import('./ConversationPane.jsx')).default;
  await React.act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(ConversationPane, { threadId: row.thread_id, folder: 'INBOX', accountId: 'acct', selectedMessageId: 'C' }))));
  assert.deepEqual([...document.querySelectorAll('[data-message-id]')].map(el => el.dataset.messageId), ['C']);
  assert.ok(document.querySelector('iframe').srcdoc.includes('Actual body C'));
  assert.equal(calls, 1, 'StrictMode does not discard the handoff and fetch the conversation again');
});

test('a failed preview shows an error instead of a permanent loading placeholder', async () => {
  bodyCache.delete('C');
  api.getMessageBody = async () => { throw new Error('Provider unavailable'); };
  await React.act(async () => root.render(React.createElement(SwipeMessagePreview, { row: rows[2] })));
  await wait(10);
  assert.ok(document.getElementById('root').textContent.includes('Provider unavailable'));
  assert.equal(document.querySelector('[role="status"]'), null);
  assert.deepEqual(reads, []);
});

test('the quiet-scroll fallback waits for touch release when scrollend is unavailable', async () => {
  let owner = dom.window.HTMLElement.prototype;
  while (owner && !Object.hasOwn(owner, 'onscrollend')) owner = Object.getPrototypeOf(owner);
  const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'onscrollend');
  if (owner) delete owner.onscrollend;
  try {
    const moved = [];
    const el = await pager(dir => { moved.push(dir); return true; });
    assert.equal('onscrollend' in el, false);
    await React.act(async () => { event(el, 'touchstart'); el.scrollLeft = 832; event(el, 'scroll'); });
    await wait(300);
    assert.deepEqual(moved, []);
    await React.act(async () => event(el, 'touchend'));
    await wait(300);
    assert.deepEqual(moved, ['next']);
  } finally {
    if (owner) Object.defineProperty(owner, 'onscrollend', descriptor);
  }
});

test('a preview body arriving after sign-out is not cached for the next user', async () => {
  bodyCache.delete('C');
  let resolve;
  api.getMessageBody = () => new Promise(done => { resolve = done; });
  const Card = (await import('./ConversationMessageCard.jsx')).default;
  await React.act(async () => root.render(React.createElement(Card, { message: rows[2], expanded: true, preview: true })));
  await React.act(async () => useStore.setState({ user: { id: 'other-user' } }));
  await React.act(async () => resolve({ html: '<p>private C</p>' }));
  assert.equal(bodyCache.has('C'), false);
});

test('conversation positioning follows body height in its own scroller and stops on user input', async () => {
  const { useConversationScroll } = await import('../hooks/useConversationScroll.js');
  const OriginalObserver = dom.window.ResizeObserver;
  let notify;
  let disconnected = false;
  dom.window.ResizeObserver = class {
    constructor(callback) { notify = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  const stackRef = React.createRef();
  function Stack() {
    useConversationScroll(stackRef, 'C', 'B,C');
    return React.createElement('div', { ref: stackRef }, React.createElement('div', { 'data-message-id': 'B' }), React.createElement('div', { 'data-message-id': 'C' }));
  }
  try {
    await React.act(async () => root.render(React.createElement(Stack)));
    const stack = stackRef.current;
    const card = stack.lastElementChild;
    Object.defineProperty(stack, 'clientHeight', { value: 400 });
    Object.defineProperty(card, 'offsetTop', { value: 70 });
    Object.defineProperty(card, 'offsetHeight', { value: 800 });
    notify();
    assert.equal(stack.scrollTop, 70, 'the actual selected card is aligned without scrolling an outer pager');
    stack.scrollTop = 150;
    event(stack, 'scroll');
    assert.equal(disconnected, true, 'late frame/image changes cannot override the reader scrolling');
    notify();
    assert.equal(stack.scrollTop, 150);
  } finally {
    await React.act(async () => root.render(null));
    dom.window.ResizeObserver = OriginalObserver;
  }
});

test('plain-text previews reuse the body card and preserve escaping and safe link rendering', async () => {
  bodyCache.set('C', { text: '<script>bad()</script> & https://example.invalid/', attachments: [] });
  await React.act(async () => root.render(React.createElement(SwipeMessagePreview, { row: rows[2] })));
  const cards = document.querySelectorAll('.msg-card');
  const body = cards[cards.length - 1];
  assert.ok(body.textContent.includes('<script>bad()</script> &'));
  assert.equal(body.querySelector('script'), null);
  assert.equal(body.querySelector('a').getAttribute('rel'), 'noopener noreferrer');
  assert.match(body.style.fontFamily, /DM Sans/);
  assert.deepEqual(reads, []);
});

test('a conversation preview follows its focused card in the same scrolling element that reserves the gutter', async () => {
  const OriginalObserver = dom.window.ResizeObserver;
  const observers = [];
  dom.window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { observers.push({ target, callback: this.callback }); }
    disconnect() {}
  };
  const row = { ...rows[2], thread_id: 'focused-preview', message_count: 2 };
  api.getThread = async () => ({ messages: [{ ...row, id: 'C-old', date: '2026-11-05T00:00:00Z' }, row] });
  useStore.setState({ conversationMode: 'pane' });
  try {
    await React.act(async () => root.render(React.createElement(SwipeMessagePreview, { row })));
    await wait(30);
    const card = document.querySelector('[data-message-id="C"]');
    const scroller = card.closest('.material-message-scroll');
    Object.defineProperty(scroller, 'clientHeight', { value: 400 });
    Object.defineProperty(card, 'offsetTop', { value: 70 });
    Object.defineProperty(card, 'offsetHeight', { value: 800 });
    const observer = observers.find(item => item.target === card);
    assert.ok(observer, 'the selected card is observed for late body height changes');
    observer.callback();
    assert.equal(scroller.scrollTop, 70, 'alignment moves the preview scroller, not a non-scrolling wrapper');
    assert.equal(scroller.hasAttribute('inert'), true, 'preview alignment does not make its actions interactive');
  } finally {
    dom.window.ResizeObserver = OriginalObserver;
  }
});
