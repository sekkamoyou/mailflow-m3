// Pending SSO sign-in and recovery-email reauthentication use the server's current contract.
//
// Same loader hooks as ProfileModal.render.test.js: node --test cannot parse JSX, and
// react-i18next is stubbed so t() returns its key.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { transform } from 'sucrase';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('react-i18next/dist/es/index.js') || url.endsWith('/react-i18next')) {
      return { format: 'module', shortCircuit: true, source: [
        'const t = k => k; export const useTranslation = () => ({ t, i18n: { language: "en", changeLanguage: () => {} } });',
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
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  CustomEvent: dom.window.CustomEvent, Node: dom.window.Node, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.requestAnimationFrame ??= cb => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame ??= id => clearTimeout(id);
globalThis.__VITE_ENV__ = { MODE: 'test', DEV: false, PROD: true };

const { default: React } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const LoginPage = (await import('./LoginPage.jsx')).default;
const AdminPanel = (await import('./AdminPanel.jsx')).default;
const { api } = await import('../utils/api.js');
const { useStore } = await import('../store/index.js');
const original = { ...api, totp: { ...api.totp }, oidc: { ...api.oidc } };
let root, recovery, calls, write, pending, signedIn;
const type = async (node, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const click = async node => act(async () => node.click());
const mount = async (Component = AdminPanel) => {
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Component)));
};
const form = () => document.querySelector('form[aria-labelledby="recovery-email-title"]');
const save = () => form().querySelector('button[type=submit]');
const submit = async () => act(async () => form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
beforeEach(() => {
  sessionStorage.clear(); window.history.replaceState({}, '', '/login');
  recovery = { email: 'old@example.invalid', reauth: 'password' }; calls = []; signedIn = [];
  pending = { step: 'totp', deviceTrustAvailable: true };
  write = async (email, confirm) => { calls.push({ email, confirm }); recovery = { ...recovery, email }; return { ok: true }; };
  api.getRecoveryEmail = async () => ({ ...recovery });
  api.updateRecoveryEmail = (...args) => write(...args);
  api.getRegistrationStatus = async () => ({ open: false });
  api.oidc.getProviders = async () => ({ providers: [] });
  api.oidc.getIdentities = async () => ({ identities: [], reauth: 'password' });
  api.apiTokens.list = async () => ({ enabled: false, tokens: [] });
  api.totp.pending = async () => pending;
  api.totp.challenge = async code => { calls.push({ code }); return { user: { id: 'signed-in' } }; };
  api.totp.verifyEmailOtp = async code => { calls.push({ code }); return { user: { id: 'signed-in' } }; };
  api.totp.sendEmailOtp = async () => ({ emailHint: 'o***@example.invalid' });
  useStore.setState({ user: { id: 'auth-user', isAdmin: false, totpEnabled: false }, adminTab: 'security', accounts: [], setUser: user => signedIn.push(user), loadPreferences: async () => {} });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount()); root = null;
  Object.assign(api, original); Object.assign(api.totp, original.totp); Object.assign(api.oidc, original.oidc);
});

test('recovery change asks for a password and blocks duplicate pending saves', async () => {
  let release; write = (email, confirm) => new Promise(resolve => { calls.push({ email, confirm }); release = () => { recovery.email = email; resolve({ ok: true }); }; });
  await mount(); await type(document.getElementById('recovery-email'), 'next@example.invalid');
  assert.equal(save().disabled, true);
  await type(document.getElementById('recovery-confirm-password'), 'test-only-password');
  await act(async () => { form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  assert.deepEqual(calls, [{ email: 'next@example.invalid', confirm: { password: 'test-only-password' } }]);
  assert.equal(save().disabled, true);
  await act(async () => release());
  assert.equal(document.getElementById('recovery-email').value, 'next@example.invalid');
  assert.equal(document.getElementById('recovery-confirm-password'), null);
});

test('recovery TOTP failure clears the code and refreshes the confirmation method', async () => {
  recovery.reauth = 'totp';
  write = async (email, confirm) => { calls.push({ email, confirm }); recovery.reauth = 'password'; throw new Error('Wrong code'); };
  await mount(); await type(document.getElementById('recovery-email'), 'next@example.invalid');
  await type(document.getElementById('recovery-confirm-code'), '12x3456');
  await submit();
  assert.deepEqual(calls[0].confirm, { totpCode: '123456' });
  assert.match(form().textContent, /Wrong code/);
  assert.equal(document.getElementById('recovery-confirm-code'), null);
  assert.equal(document.getElementById('recovery-confirm-password').value, '');
  assert.equal(save().disabled, true);
});

test('recovery SSO drafts are scoped to the current user and restored on return', async () => {
  recovery.reauth = 'oidc'; recovery.oidc = { providers: [{ slug: 'corp', name: 'Corp' }], confirmedUntil: null };
  await mount(); await type(document.getElementById('recovery-email'), 'next@example.invalid');
  const link = form().querySelector('a'); link.addEventListener('click', event => event.preventDefault());
  await click(link);
  assert.equal(link.getAttribute('href'), '/auth/oidc/corp/start?action=reauth');
  assert.equal(sessionStorage.getItem('mailflow_recovery_email_draft:auth-user'), 'next@example.invalid');
  await act(async () => root.unmount()); root = null;
  recovery.oidc.confirmedUntil = new Date(Date.now() + 60_000).toISOString();
  await mount();
  assert.equal(document.getElementById('recovery-email').value, 'next@example.invalid');
  assert.equal(sessionStorage.getItem('mailflow_recovery_email_draft:auth-user'), null);
  await submit(); assert.deepEqual(calls, [{ email: 'next@example.invalid', confirm: {} }]);
});

test('OIDC plus TOTP recovery asks for both and spends no change without the code', async () => {
  recovery.reauth = 'oidc'; recovery.oidc = { providers: [{ slug: 'corp', name: 'Corp' }], confirmedUntil: new Date(Date.now() + 60_000).toISOString(), totpToo: true };
  write = async (email, confirm) => { calls.push({ email, confirm }); recovery.email = email; recovery.oidc.confirmedUntil = null; return { ok: true }; };
  await mount(); await type(document.getElementById('recovery-email'), 'next@example.invalid');
  assert.equal(save().disabled, true); assert.equal(form().querySelector('a'), null);
  await submit(); assert.deepEqual(calls, []);
  await type(document.getElementById('recovery-confirm-code'), '123456'); await submit();
  assert.deepEqual(calls, [{ email: 'next@example.invalid', confirm: { totpCode: '123456' } }]);
  await type(document.getElementById('recovery-email'), 'another@example.invalid');
  assert.ok(form().querySelector('a')); assert.equal(save().disabled, true);
});

test('a recovery load or refresh failure leaves saving disabled and explains reload', async () => {
  api.getRecoveryEmail = async () => { throw new Error('offline'); };
  await mount(); assert.match(form().textContent, /admin.security.recoveryLoadFailed/); assert.equal(save().disabled, true);
  await act(async () => root.unmount()); root = null;
  api.getRecoveryEmail = async () => ({ ...recovery }); await mount();
  await type(document.getElementById('recovery-email'), 'next@example.invalid');
  await type(document.getElementById('recovery-confirm-password'), 'test-only');
  write = async () => { api.getRecoveryEmail = async () => { throw new Error('offline'); }; throw new Error('Refused'); };
  await submit();
  assert.match(form().textContent, /Refused.*admin.security.recoveryLoadFailed/);
  assert.equal(save().disabled, true); assert.equal(document.getElementById('recovery-email').value, 'next@example.invalid');
});

for (const [step, title] of [['totp', 'login.totp.title'], ['email', 'login.emailOtp.title'], ['enroll', 'login.mfaEnroll.title']]) {
  test(`SSO callback resumes pending ${step} without signing in`, async () => {
    pending = { step, emailHint: 'o***@example.invalid', emailSendFailed: step === 'email', deviceTrustAvailable: true };
    window.history.replaceState({}, '', '/login?oidc_mfa=1'); await mount(LoginPage);
    assert.match(document.body.textContent, new RegExp(title)); assert.deepEqual(signedIn, []);
    assert.equal(window.location.search, '');
    if (step === 'email') {
      assert.match(document.body.textContent, /login.emailOtp.sendFailed/);
      const resend = [...document.querySelectorAll('button')].find(button => button.textContent.includes('login.emailOtp.resend'));
      await click(resend); assert.doesNotMatch(document.body.textContent, /login.emailOtp.sendFailed/);
    }
    if (step === 'totp') {
      await type(document.querySelector('input[autocomplete=one-time-code]'), '123456');
      await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      assert.deepEqual(signedIn, [{ id: 'signed-in' }]);
    }
  });
}

test('expired SSO second step is explained and does not grant a user', async () => {
  pending = { step: null }; window.history.replaceState({}, '', '/login?oidc_mfa=1'); await mount(LoginPage);
  assert.match(document.body.textContent, /login.ssoSecondStepExpired/); assert.deepEqual(signedIn, []);
});

test('password login explains email delivery failure and keeps retry failure visible', async () => {
  api.login = async () => ({ requiresEmailOTP: true, emailHint: 'o***@example.invalid', emailSendFailed: true });
  api.totp.sendEmailOtp = async () => ({ emailSendFailed: true });
  await mount(LoginPage);
  await type(document.getElementById('material-username'), 'synthetic-user');
  await type(document.getElementById('material-password'), 'test-only');
  await act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.match(document.body.textContent, /login.emailOtp.sendFailed/);
  await click([...document.querySelectorAll('button')].find(button => button.textContent.includes('login.emailOtp.resend')));
  assert.match(document.body.textContent, /login.emailOtp.sendFailed/);
  assert.deepEqual(signedIn, []);
});
