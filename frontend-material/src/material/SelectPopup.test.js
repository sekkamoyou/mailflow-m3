import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
import { JSDOM } from 'jsdom';
registerHooks({ load(url, context, next) {
  if (url.endsWith('.jsx')) return { format: 'module', shortCircuit: true, source: transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic' }).code };
  return next(url, context);
} });
const dom = new JSDOM('<button id="outside">Other</button><div id="root"></div>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { MaterialSelect } = await import('./controls.jsx');
const { default: MaterialDialog } = await import('./MaterialDialog.jsx');
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; delete globalThis.CSS; });
const options = () => [
  React.createElement('option', { key: 'a', value: 'a' }, 'Alpha'),
  React.createElement('option', { key: 'b', value: 'b', disabled: true }, 'Beta'),
  React.createElement('option', { key: 'c', value: 'c' }, 'Charlie'),
  React.createElement('option', { key: 'd', value: 'd' }, 'Delta'),
];
const render = async element => { root = createRoot(document.getElementById('root')); await React.act(async () => root.render(element)); };
const key = async (target, name) => React.act(async () => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
const open = async () => React.act(async () => {
  const select = document.querySelector('select');
  select.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
  select.click();
});

test('custom popup preserves native controlled value, ref, form and change target', async () => {
  const ref = React.createRef(); let target; let saved;
  function Controlled() {
    const [value, setValue] = React.useState('a');
    return React.createElement('form', { id: 'form' }, React.createElement(MaterialSelect, { ref, value, name: 'choice', required: true, 'aria-label': 'Choice',
      onChange: event => { target = event.target; saved = event.target.value; setValue(saved); } }, options()));
  }
  await render(React.createElement(Controlled)); const native = ref.current;
  await open(); await key(document.activeElement, 'ArrowDown');
  assert.equal(document.activeElement.textContent, 'Charlie');
  await key(document.activeElement, 'Enter');
  assert.ok(target === native); assert.ok(ref.current === native); assert.equal(saved, 'c');
  assert.equal(new window.FormData(document.getElementById('form')).get('choice'), 'c');
  assert.ok(document.activeElement === native); assert.ok(!document.querySelector('[role=listbox]'));
});

test('Home, End and typeahead skip disabled options; Escape keeps the original value', async () => {
  await render(React.createElement(MaterialSelect, { defaultValue: 'c', 'aria-label': 'Choice' }, options()));
  await open(); await key(document.activeElement, 'End'); assert.equal(document.activeElement.textContent, 'Delta');
  await key(document.activeElement, 'Home'); assert.equal(document.activeElement.textContent, 'Alpha');
  await key(document.activeElement, 'c'); assert.equal(document.activeElement.textContent, 'Charlie');
  await key(document.activeElement, 'Escape'); assert.equal(document.querySelector('select').value, 'c');
  assert.ok(!document.querySelector('[role=listbox]'));
});

test('a popup inside a modal stays within the active focus/inert boundary', async () => {
  await render(React.createElement(MaterialDialog, { 'aria-label': 'Settings' }, React.createElement(MaterialSelect, { defaultValue: 'a', 'aria-label': 'Choice' }, options())));
  await open();
  const popup = document.querySelector('[role=listbox]');
  assert.ok(Boolean(popup.closest('[aria-modal=true]')));
  assert.ok(!popup.closest('[inert]')); assert.equal(document.activeElement.getAttribute('role'), 'option');
  await key(document.activeElement, 'Tab');
  assert.ok(!document.querySelector('[role=listbox]')); assert.equal(document.activeElement.tagName, 'SELECT');
});

test('Tab from the last select still wraps within its parent modal', async () => {
  await render(React.createElement(MaterialDialog, { 'aria-label': 'Settings' },
    React.createElement('button', { id: 'first' }, 'First'),
    React.createElement(MaterialSelect, { 'aria-label': 'Choice' }, options())));
  await open();
  const event = new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await React.act(async () => document.activeElement.dispatchEvent(event));
  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement.id, 'first');
});

test('outside pointer dismissal does not restore focus over the new target', async () => {
  await render(React.createElement(MaterialSelect, { defaultValue: 'a', 'aria-label': 'Choice' }, options()));
  await open(); const outside = document.getElementById('outside');
  await React.act(async () => { outside.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); outside.focus(); });
  assert.ok(!document.querySelector('[role=listbox]')); assert.ok(document.activeElement === outside);
});

test('supported base-select browsers retain their native customizable picker', async () => {
  globalThis.CSS = { supports: () => true };
  await render(React.createElement(MaterialSelect, { defaultValue: 'a', 'aria-label': 'Choice' }, options()));
  await open(); assert.ok(!document.querySelector('[role=listbox]'));
});

test('an all-disabled popup still supports Escape', async () => {
  await render(React.createElement(MaterialSelect, { 'aria-label': 'Choice' }, React.createElement('option', { disabled: true }, 'Unavailable')));
  await open(); assert.equal(document.activeElement.getAttribute('role'), 'listbox');
  await key(document.activeElement, 'Escape'); assert.ok(!document.querySelector('[role=listbox]'));
});

test('clicking the native trigger again dismisses without changing its value', async () => {
  await render(React.createElement(MaterialSelect, { defaultValue: 'a', 'aria-label': 'Choice' }, options()));
  await open(); assert.ok(Boolean(document.querySelector('[role=listbox]')));
  await open(); assert.ok(!document.querySelector('[role=listbox]'));
  assert.equal(document.querySelector('select').value, 'a');
});

test('a native select title also names the fallback listbox', async () => {
  await render(React.createElement(MaterialSelect, { title: 'Messages per page' }, options()));
  await open(); assert.equal(document.querySelector('[role=listbox]').getAttribute('aria-label'), 'Messages per page');
});

test('popup coordinates stay local to a scaled modal containing block', async () => {
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'scaled') return { left: 50, top: 20, width: 520, height: 520 };
    if (this.tagName === 'SELECT') return { left: 102, right: 362, top: 130, bottom: 202, width: 260, height: 72 };
    return original.call(this);
  };
  try {
    await render(React.createElement(MaterialDialog, { id: 'scaled', style: { transform: 'scale(1.3)' }, 'aria-label': 'Settings' },
      React.createElement(MaterialSelect, { 'aria-label': 'Choice' }, options())));
    Object.defineProperty(document.getElementById('scaled'), 'offsetWidth', { configurable: true, value: 400 });
    Object.defineProperty(document.getElementById('scaled'), 'offsetHeight', { configurable: true, value: 400 });
    await open(); const popup = document.querySelector('[role=listbox]');
    assert.equal(parseFloat(popup.style.left), 40);
    assert.equal(parseFloat(popup.style.top), 140);
    assert.equal(parseFloat(popup.style.width), 200);
  } finally { window.HTMLElement.prototype.getBoundingClientRect = original; }
});
