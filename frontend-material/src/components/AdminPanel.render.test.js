// Render test for the account form's automatic Cc and Bcc lists (#491).
//
// The parsing is unit-tested in utils/autoRecipients.test.js. What only a render shows is the
// wiring: the fields show the saved lists, and Save sends both of them. A list the user did not
// touch has to go back as saved, or every unrelated edit, such as a new colour, would clear it.
//
// Same loader hooks as ProfileModal.render.test.js: node --test cannot parse JSX, and
// react-i18next is stubbed so t() returns its key.

import { test, describe, before, afterEach } from 'node:test';
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
  CustomEvent: dom.window.CustomEvent, Node: dom.window.Node, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.__VITE_ENV__ = { MODE: 'test', DEV: false, PROD: true };
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { useStore } = await import('../store/index.js');
const { api } = await import('../utils/api.js');
const AdminPanel = (await import('./AdminPanel.jsx')).default;

test('About is available to regular users and separates versions from short build hashes', async () => {
  const originalFetch = globalThis.fetch;
  const frontendSha = '123456789abcdef0123456789abcdef012345678';
  let backendSha = 'abcdef1234567890abcdef1234567890abcdef12';
  globalThis.__VITE_ENV__.VITE_BUILD_SHA = frontendSha;
  globalThis.fetch = async (url, options) => url === '/api/version'
    ? { ok: true, json: async () => ({ version: '4.4.0', sha: backendSha }) }
    : originalFetch(url, options);
  useStore.setState({ user: { id: 'u1', isAdmin: false }, accounts: [], adminTab: 'accounts' });
  const root = createRoot(document.getElementById('root'));
  const rowValue = key => [...document.querySelectorAll('span')].find(span => span.textContent === key)?.nextElementSibling?.textContent;
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const about = [...document.querySelectorAll('button')].find(button => button.textContent.includes('admin.tabs.about'));
    assert.ok(about);
    await React.act(async () => about.click());
    const frontendVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
    assert.equal(rowValue('admin.about.frontendVersion'), frontendVersion);
    assert.equal(rowValue('admin.about.frontendBuild'), '1234567');
    assert.equal(rowValue('admin.about.version'), '4.4.0');
    assert.equal(rowValue('admin.about.backendBuild'), 'abcdef1');
    assert.ok(document.querySelector('a[href="https://github.com/sekkamoyou/mailflow-m3/tree/mailflow-m3/frontend-material"]'));
    assert.ok(document.querySelector('a[href="https://github.com/sekkamoyou/mailflow-m3/tree/mailflow-m3/backend"]'));
    assert.ok(document.querySelector('a[href="/licenses/AGPL-3.0.txt"]'));
    await React.act(async () => useStore.setState({ adminTab: 'accounts' }));
    backendSha = 'dev';
    await React.act(async () => useStore.setState({ adminTab: 'about' }));
    assert.equal(rowValue('admin.about.backendBuild'), '—');
  } finally {
    await React.act(async () => root.unmount());
    delete globalThis.__VITE_ENV__.VITE_BUILD_SHA;
    globalThis.fetch = originalFetch;
  }
});

test('color palettes are named native radio options independent of light/dark mode', async () => {
  const original = useStore.getState().setColorPalette;
  const chosen = [];
  useStore.setState({ user: { id: 'u1' }, accounts: [], adminTab: 'appearance', theme: 'dark', colorPalette: 'purple', setColorPalette: value => { chosen.push(value); useStore.setState({ colorPalette: value }); } });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const options = [...document.querySelectorAll('input[name="material-palette"]')];
    assert.equal(options.length, 7);
    assert.equal(options.filter(input => input.checked).length, 1);
    assert.ok(options.every(input => input.closest('label').textContent.startsWith('material.palettes.')));
    await React.act(async () => options.find(input => input.value === 'teal').click());
    assert.deepEqual(chosen, ['teal']);
    assert.equal(document.querySelector('input[name="material-palette"]:checked').value, 'teal');
    assert.equal(useStore.getState().theme, 'dark');
  } finally {
    await React.act(async () => root.unmount());
    useStore.setState({ setColorPalette: original, colorPalette: 'purple' });
  }
});

test('custom palette validates HEX drafts, applies native color changes and recalls the saved seed', async () => {
  const original = useStore.getState().setColorPalette;
  const calls = [];
  useStore.setState({ user: { id: 'u1' }, accounts: [], adminTab: 'appearance', theme: 'dark', colorPalette: 'purple', customColor: '#123456', setColorPalette: value => { calls.push(value); useStore.setState({ colorPalette: value, ...(value.startsWith('#') ? { customColor: value } : {}) }); } });
  const root = createRoot(document.getElementById('root'));
  const type = async (input, value) => React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    await React.act(async () => document.querySelector('input[name="material-palette"][value="custom"]').click());
    const input = document.querySelector('input[placeholder="#6750a4"]');
    assert.equal(input.getAttribute('aria-label'), 'material.palettes.hexValue');
    assert.equal(input.value, '#123456');
    await type(input, '#zzzzzz');
    await React.act(async () => input.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(document.getElementById(input.getAttribute('aria-describedby')).getAttribute('role'), 'alert');
    assert.deepEqual(calls, ['#123456']);
    await type(input, '#AABBCC');
    await React.act(async () => input.form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(useStore.getState().colorPalette, '#aabbcc');
    assert.equal(document.querySelector('input[type="color"]').value, '#aabbcc');
    await type(document.querySelector('input[type="color"]'), '#ffcc00');
    assert.equal(useStore.getState().colorPalette, '#ffcc00');
    assert.equal(input.value, '#ffcc00');
    await React.act(async () => document.querySelector('input[name="material-palette"][value="blue"]').click());
    assert.equal(Boolean(document.querySelector('input[type="color"]')), false);
    await React.act(async () => document.querySelector('input[name="material-palette"][value="custom"]').click());
    assert.equal(document.querySelector('input[placeholder="#6750a4"]').value, '#ffcc00');
    assert.equal(useStore.getState().theme, 'dark');
  } finally {
    await React.act(async () => root.unmount());
    useStore.setState({ setColorPalette: original, colorPalette: 'purple', customColor: '#6750a4' });
  }
});

const ACCOUNT = {
  id: 'acct', name: 'Work', email_address: 'me@example.invalid', color: '#6366f1',
  imap_host: 'imap.example.invalid', imap_port: 993, auth_user: 'me@example.invalid',
  smtp_host: 'smtp.example.invalid', smtp_port: 587, smtp_tls: 'STARTTLS',
  auto_cc_addresses: ['boss@example.invalid'], auto_bcc_addresses: ['me@example.invalid'],
};

describe('account form: automatic Cc and Bcc (#491)', () => {
  const sent = [];
  let reply; // what the stubbed PUT /accounts/:id does with each request
  let root;

  before(() => {
    api.admin.getSettings = async () => ({ settings: {} });
    api.getUnreadCounts = async () => ({});
    api.updateAccount = async (id, updates) => { sent.push({ id, updates }); return reply(updates); };
  });
  afterEach(() => React.act(async () => root.unmount()));

  const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const field = (placeholder) => {
    const input = document.querySelector(`input[placeholder="${placeholder}"]`);
    assert.ok(input, `the form has a ${placeholder} field`);
    return input;
  };
  async function type(input, text) {
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => {
      setValue.call(input, text);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  const save = () => click([...document.querySelectorAll('button')].find(b => b.textContent === 'admin.accounts.saveChanges'));

  // Settings > Accounts > Edit, for an account that already has both lists saved.
  async function openEdit() {
    sent.length = 0;
    useStore.setState({ user: { id: 'u1' }, accounts: [ACCOUNT], adminTab: 'accounts' });
    root = createRoot(document.getElementById('root'));
    await React.act(async () => { root.render(React.createElement(AdminPanel)); });
    await click(document.querySelector('button[title="common.edit"]'));
  }

  test('Save sends the edited list parsed and the untouched list as saved', async () => {
    reply = (updates) => ({ ...ACCOUNT, ...updates });
    await openEdit();
    assert.equal(field('compose.ccPh').value, 'boss@example.invalid', 'the saved Cc list is shown');
    assert.equal(field('compose.bccPh').value, 'me@example.invalid', 'the saved Bcc list is shown');

    await type(field('compose.bccPh'), 'me@example.invalid; archive@example.invalid,');
    await save();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, 'acct');
    assert.deepEqual(sent[0].updates.auto_cc_addresses, ['boss@example.invalid']);
    assert.deepEqual(sent[0].updates.auto_bcc_addresses, ['me@example.invalid', 'archive@example.invalid']);
  });

  test('an emptied field stays empty and Save clears that list', async () => {
    reply = (updates) => ({ ...ACCOUNT, ...updates });
    await openEdit();
    await type(field('compose.ccPh'), '');
    assert.equal(field('compose.ccPh').value, '', 'the field does not fall back to the saved list');

    await save();

    assert.deepEqual(sent[0].updates.auto_cc_addresses, []);
    assert.deepEqual(sent[0].updates.auto_bcc_addresses, ['me@example.invalid']);
  });

  test('a typed Cc list is saved parsed, and an emptied Bcc field stays empty and clears that list', async () => {
    reply = (updates) => ({ ...ACCOUNT, ...updates });
    await openEdit();
    await type(field('compose.ccPh'), 'boss@example.invalid, cfo@example.invalid');
    await type(field('compose.bccPh'), '');
    assert.equal(field('compose.bccPh').value, '', 'the field does not fall back to the saved list');

    await save();

    assert.deepEqual(sent[0].updates.auto_cc_addresses, ['boss@example.invalid', 'cfo@example.invalid']);
    assert.deepEqual(sent[0].updates.auto_bcc_addresses, []);
  });

  test('a list the server rejects shows its error, and the typed text stays', async () => {
    const error = 'Automatic Bcc: "me" is not a single email address (use name@example.com)';
    reply = () => { throw new Error(error); };
    await openEdit();
    await type(field('compose.bccPh'), 'me');
    await save();

    assert.equal(sent.length, 1);
    assert.ok(document.body.textContent.includes(error), 'the server error is shown in the form');
    assert.equal(field('compose.bccPh').value, 'me');
  });
});

// #624: the icon picker changed the form, but Save left icon out of the update, so the server kept
// the old value and the color dot came back.
describe('account form: icon (#376, #624)', () => {
  const sent = [];
  let root;

  before(() => {
    api.admin.getSettings = async () => ({ settings: {} });
    api.getUnreadCounts = async () => ({});
    api.updateAccount = async (id, updates) => { sent.push({ id, updates }); return { ...ACCOUNT, ...updates }; };
  });
  afterEach(() => React.act(async () => root.unmount()));

  const click = (el) => React.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent === text);

  async function openEdit(account) {
    sent.length = 0;
    useStore.setState({ user: { id: 'u1' }, accounts: [account], adminTab: 'accounts' });
    root = createRoot(document.getElementById('root'));
    await React.act(async () => { root.render(React.createElement(AdminPanel)); });
    await click(document.querySelector('button[title="common.edit"]'));
  }

  test('a picked icon is sent on Save and lands in the store', async () => {
    await openEdit({ ...ACCOUNT, icon: null });
    await click(button('🔒'));
    await click(button('admin.accounts.saveChanges'));

    assert.equal(sent.length, 1);
    assert.equal(sent[0].updates.icon, '🔒');
    assert.equal(useStore.getState().accounts[0].icon, '🔒');
  });

  test('choosing the color dot sends null, which clears a saved icon', async () => {
    await openEdit({ ...ACCOUNT, icon: '💼' });
    await click(document.querySelector('button[aria-label="admin.accounts.iconNone"]'));
    await click(button('admin.accounts.saveChanges'));

    assert.ok('icon' in sent[0].updates, 'icon is part of the update');
    assert.equal(sent[0].updates.icon, null);
  });

  test('an unrelated edit keeps the saved icon', async () => {
    await openEdit({ ...ACCOUNT, icon: '💼' });
    await click(button('admin.accounts.saveChanges'));

    assert.equal(sent[0].updates.icon, '💼');
  });
});

test('Material settings tabs have one tab stop, linked panels and arrow/Home/End selection', async () => {
  useStore.setState({ user: { id: 'u1', isAdmin: false }, accounts: [], adminTab: 'appearance' });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const tabs = [...document.querySelectorAll('[role="tablist"] [role="tab"]')];
    assert.ok(tabs.length > 1);
    assert.equal(tabs.filter(tab => tab.tabIndex === 0).length, 1);
    const scrolled = [];
    tabs.forEach((tab, index) => { tab.scrollIntoView = options => scrolled.push({ index, options }); });
    tabs[0].focus();
    const key = async name => React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
    await key('ArrowRight');
    assert.ok(document.activeElement === tabs[1]);
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    assert.equal(document.getElementById(tabs[1].getAttribute('aria-controls')).hidden, false);
    await key('End'); assert.ok(document.activeElement === tabs.at(-1));
    await key('Home'); assert.ok(document.activeElement === tabs[0]);
    assert.deepEqual(scrolled, [1, tabs.length - 1, 0].map(index => ({
      index, options: { block: 'nearest', inline: 'nearest' },
    })));
    assert.ok(tabs.every(tab => document.getElementById(tab.getAttribute('aria-controls'))));
  } finally { await React.act(async () => root.unmount()); }
});

test('a sound dropdown groups built-in and uploaded sounds and keeps upload separate', async () => {
  useStore.setState({ user: { id: 'u1', isAdmin: false }, accounts: [], adminTab: 'notifications', notificationSound: 'none', customSoundDataUrl: null });
  const originalReader = globalThis.FileReader;
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const select = document.getElementById('notification-sound');
    assert.ok(select);
    assert.equal(select.labels[0].textContent, 'admin.search.notificationSound');
    assert.equal(select.querySelectorAll('optgroup').length, 2);
    assert.equal(select.querySelector('option[value=custom]').disabled, true);
    await React.act(async () => { select.value = 'xylophone'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(useStore.getState().notificationSound, 'xylophone');
    assert.equal(document.getElementById('notification-sound-description').textContent, 'Bright ascending');
    assert.equal(document.querySelectorAll('.md-sound-options button[data-variant=card]').length, 0);
    const upload = document.querySelector('.md-sound-actions input[type=file]');
    assert.ok(upload && !upload.closest('button'));
    globalThis.FileReader = class { readAsDataURL() { this.onload({ target: { result: 'data:audio/wav;base64,VGVzdA==' } }); } };
    Object.defineProperty(upload, 'files', { configurable: true, value: [{ name: 'custom-tone.wav', size: 1024 }] });
    await React.act(async () => upload.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(useStore.getState().notificationSound, 'custom');
    assert.equal(select.value, 'custom');
    assert.equal(select.querySelector('option[value=custom]').textContent, 'custom-tone.wav');
    assert.equal(select.querySelector('option[value=custom]').disabled, false);
    await React.act(async () => { select.value = 'none'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(document.querySelector('.md-sound-actions button').disabled, true, 'silent choice cannot be previewed');
    Object.defineProperty(upload, 'files', { configurable: true, value: [{ name: 'large.wav', size: 3 * 1024 * 1024 }] });
    await React.act(async () => upload.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.match(document.querySelector('.md-sound-options [role=alert]').textContent, /uploadError/);
    assert.equal(useStore.getState().notificationSound, 'none', 'a rejected upload keeps the current choice');
    assert.equal(localStorage.getItem('mailflow_custom_sound_name'), 'custom-tone.wav');
  } finally {
    globalThis.FileReader = originalReader;
    await React.act(async () => root.unmount());
  }
});

test('only an administrator can save the shared app display name', async () => {
  const original = api.admin.updateSettings;
  const updates = [];
  api.admin.updateSettings = async payload => { updates.push(payload); return { ok: true }; };
  useStore.setState({ user: { id: 'u1', isAdmin: true }, accounts: [], adminTab: 'appearance', appDisplayName: 'MailFlow' });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const input = document.querySelector('input[name="app_display_name"]');
    assert.ok(input);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setter.call(input, '우리 우편함'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await React.act(async () => input.closest('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(updates, [{ app_display_name: '우리 우편함' }]);
    assert.equal(useStore.getState().appDisplayName, '우리 우편함');
    await React.act(async () => useStore.setState({ user: { id: 'u2', isAdmin: false } }));
    assert.equal(Boolean(document.querySelector('input[name="app_display_name"]')), false);
  } finally {
    await React.act(async () => root.unmount());
    api.admin.updateSettings = original;
    useStore.setState({ appDisplayName: 'MailFlow' });
  }
});

test('populated category sources keep named refresh and toggle actions on their own source', async () => {
  const original = { ...api.categories };
  const source = { id: 'source-url', source_type: 'url', label: 'Social source subscription', value: 'https://example.invalid/domains.txt', enabled: true, domain_count: 128 };
  const calls = [];
  api.categories.getSources = async () => ({ sources: [source], builtinSets: [] });
  api.categories.refreshSource = async id => { calls.push(['refresh', id]); return { domainCount: 130 }; };
  api.categories.toggleSource = async (id, enabled) => { calls.push(['toggle', id, enabled]); return { source: { ...source, enabled, domain_count: 130 } }; };
  useStore.setState({ user: { id: 'u1' }, accounts: [], adminTab: 'categories', categorizationEnabled: true });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const toggle = () => document.querySelector('[role=switch][aria-label="Social source subscription"]');
    const refresh = document.querySelector('button[aria-label="admin.categories.refresh"]');
    assert.ok(refresh); assert.equal(toggle().getAttribute('aria-checked'), 'true');
    assert.ok(document.body.textContent.includes(source.label));
    await React.act(async () => refresh.click());
    await React.act(async () => toggle().click());
    assert.equal(toggle().getAttribute('aria-checked'), 'false');
    assert.deepEqual(calls, [['refresh', 'source-url'], ['toggle', 'source-url', false]]);
  } finally {
    await React.act(async () => root.unmount());
    Object.assign(api.categories, original);
  }
});

test('category enablement reuses the named trailing switch and preserves its callback', async () => {
  const getSources = api.categories.getSources;
  const setEnabled = useStore.getState().setCategorizationEnabled;
  const calls = [];
  api.categories.getSources = async () => ({ sources: [], builtinSets: [] });
  useStore.setState({ user: { id: 'u1' }, accounts: [], adminTab: 'categories', categorizationEnabled: false, setCategorizationEnabled: value => calls.push(value) });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const control = document.querySelector('button[role=switch][aria-label="admin.categories.globalEnabled"]');
    assert.ok(control);
    assert.equal(control.getAttribute('aria-checked'), 'false');
    assert.ok(document.getElementById(control.getAttribute('aria-describedby')).textContent.includes('admin.categories.globalEnabledDesc'));
    assert.ok(control.previousElementSibling.textContent.includes('admin.categories.globalEnabledDesc'));
    await React.act(async () => control.click());
    assert.deepEqual(calls, [true]);
  } finally {
    await React.act(async () => root.unmount());
    api.categories.getSources = getSources;
    useStore.setState({ setCategorizationEnabled: setEnabled });
  }
});

test('account management keeps six named icon actions together without changing edit behavior', async () => {
  useStore.setState({ user: { id: 'u1' }, accounts: [ACCOUNT], adminTab: 'accounts' });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const group = document.querySelector('.admin-account-actions');
    assert.ok(group);
    const actions = [...group.querySelectorAll('button')];
    assert.equal(actions.length, 6);
    assert.ok(actions.every(button => button.dataset.variant === 'icon' && button.getAttribute('aria-label')));
    assert.ok(document.querySelector('.admin-account-identity').textContent.includes(ACCOUNT.email_address));
    await React.act(async () => actions.find(button => button.title === 'common.edit').click());
    assert.ok(document.querySelector('input[value="Work"]'));
  } finally { await React.act(async () => root.unmount()); }
});

test('personal appearance has shared/separate choices, error retry and a distinct app name', async () => {
  const originalMode = useStore.getState().setAppearanceMode;
  const originalName = useStore.getState().setPersonalDisplayName;
  const originalRetry = useStore.getState().retryAppearance;
  const calls = [];
  useStore.setState({ user: { id: 'personal' }, accounts: [], adminTab: 'appearance', appearanceMode: 'shared', appearanceStatus: 'error', personalDisplayName: '',
    setAppearanceMode: mode => calls.push(['mode', mode]), setPersonalDisplayName: name => calls.push(['name', name]), retryAppearance: () => calls.push(['retry']) });
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(AdminPanel)));
    const group = document.querySelector('.md-appearance-sync');
    assert.equal(group.querySelectorAll('input[type=radio]').length, 2);
    assert.ok(group.textContent.includes('material.appearanceSync.transition'));
    assert.ok(group.textContent.includes('material.appearanceSync.pwaHint'));
    assert.equal(document.querySelector('input[name=app_display_name]'), null);
    await React.act(async () => group.querySelector('input[value=separate]').click());
    await React.act(async () => [...group.querySelectorAll('button')].find(b => b.textContent === 'material.appearanceSync.retry').click());
    const input = group.querySelector('input[maxlength="60"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setter.call(input, '내 우편함'); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await React.act(async () => useStore.setState({ personalDisplayName: '서버에서 변경' }));
    assert.equal(input.value, '내 우편함');
    await React.act(async () => group.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.deepEqual(calls, [['mode', 'separate'], ['retry'], ['name', '내 우편함']]);
  } finally {
    await React.act(async () => root.unmount());
    useStore.setState({ setAppearanceMode: originalMode, setPersonalDisplayName: originalName, retryAppearance: originalRetry,
      personalDisplayName: '', appearanceStatus: 'saved' });
  }
});
