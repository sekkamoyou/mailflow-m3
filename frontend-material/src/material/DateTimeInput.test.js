import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
import { JSDOM } from 'jsdom';

registerHooks({ load(url, context, next) {
  if (url.endsWith('react-i18next/dist/es/index.js')) return { format: 'module', shortCircuit: true,
    source: 'export const useTranslation = () => ({t:k=>k,i18n:{language:globalThis.__pickerLanguage || "en-US"}});' };
  if (url.endsWith('.jsx')) return { format: 'module', shortCircuit: true, source: transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic' }).code };
  return next(url, context);
} });
const dom = new JSDOM('<button id="outside">Outside</button><div id="root"></div>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: DateTimeInput } = await import('./DateTimeInput.jsx');
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; delete globalThis.__pickerLanguage; });
const render = async props => {
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(DateTimeInput, props)));
};
const click = async element => { assert.ok(Boolean(element), 'click target exists'); await React.act(async () => element.click()); };
const open = () => click(document.querySelector('.md-date-field > button'));
const buttons = () => [...document.querySelectorAll('.md-picker-actions button')];
const apply = () => click(buttons().at(-1));
const cancel = () => click(buttons().at(-2));
const change = async (element, value) => {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
};

test('native form/ref/change target and leap day survive calendar selection', async () => {
  const ref = React.createRef(); let target; let saved;
  function Controlled() {
    const [value, setValue] = React.useState('2028-02-28');
    return React.createElement('form', { id: 'form' }, React.createElement(DateTimeInput, {
      ref, type: 'date', name: 'due', value, required: true, min: '2028-02-01', max: '2028-03-01', 'aria-label': 'Due',
      onChange: event => { target = event.target; saved = event.target.value; setValue(saved); },
    }));
  }
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Controlled)));
  const original = ref.current;
  await open(); await click(document.querySelector('[data-date="2028-02-29"]')); await apply();
  assert.ok(target === original, 'event target is the original native input');
  assert.ok(ref.current === original, 'ref stays on the original native input');
  assert.equal(saved, '2028-02-29'); assert.equal(original.type, 'date');
  assert.equal(new window.FormData(document.getElementById('form')).get('due'), '2028-02-29');
  assert.equal(original.checkValidity(), true); assert.ok(!document.querySelector('[role=dialog]'));
});

test('cancel, Escape and nested inert isolation preserve the original date', async () => {
  await render({ type: 'date', defaultValue: '2028-02-28', 'aria-label': 'Date' });
  const trigger = document.querySelector('.md-date-field > button'); trigger.focus();
  await open();
  assert.equal(document.getElementById('root').hasAttribute('inert'), true);
  await click(document.querySelector('[data-date="2028-02-29"]')); await cancel();
  assert.equal(document.querySelector('input').value, '2028-02-28');
  assert.ok(document.activeElement === trigger);
  await open();
  await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.ok(!document.querySelector('[role=dialog]')); assert.equal(document.getElementById('root').hasAttribute('inert'), false);
});

test('bounds disable out-of-range dates and invalid typed dates never commit', async () => {
  let changes = 0;
  await render({ type: 'date', defaultValue: '2028-02-28', min: '2028-02-27', max: '2028-02-29', onChange: () => changes++, 'aria-label': 'Date' });
  await open(); assert.equal(document.querySelector('[data-date="2028-02-26"]').disabled, true);
  await click(document.querySelector('button[aria-label="materialPicker.typeDate"]'));
  const field = document.querySelector('.md-picker-date-text input');
  await change(field, '2027-02-29'); await apply();
  assert.equal(changes, 0); assert.ok(Boolean(document.querySelector('[role=alert]')));
  await change(field, '2028-03-01'); await apply(); assert.equal(changes, 0);
  await change(field, '2028-02-29'); await apply(); assert.equal(changes, 1);
});

test('time input is 24h, validates numbers and retains native value/event', async () => {
  let saved;
  await render({ type: 'time', defaultValue: '09:30', step: 60, 'aria-label': 'Time', onChange: event => { saved = event.target.value; } });
  await open();
  let fields = [...document.querySelectorAll('.md-picker-time input')];
  await change(fields[0], '24'); await apply(); assert.equal(saved, undefined);
  await change(fields[0], '0'); await change(fields[1], '05'); await apply();
  assert.equal(saved, '00:05'); assert.equal(document.querySelector('input').value, '00:05');
});

test('datetime uses local strings and original min/max including time', async () => {
  let saved;
  await render({ type: 'datetime-local', defaultValue: '2028-02-29T09:30', min: '2028-02-29T10:00', max: '2028-02-29T23:59', step: 60, 'aria-label': 'Date time', onChange: e => { saved = e.target.value; } });
  await open(); await apply(); assert.equal(saved, undefined);
  await change(document.querySelector('.md-picker-time input'), '11'); await apply();
  assert.equal(saved, '2028-02-29T11:30');
});

test('optional clear emits a native change; required fields offer no clear action', async () => {
  let saved;
  await render({ type: 'date', defaultValue: '2028-02-28', 'aria-label': 'Date', onChange: event => { saved = event.target.value; } });
  await open(); await click(buttons()[0]); assert.equal(saved, '');
  await React.act(async () => root.render(React.createElement(DateTimeInput, { type: 'date', required: true, defaultValue: '2028-02-28' })));
  await open(); assert.equal(buttons().length, 2);
});

test('calendar keyboard crosses leap day/month and keeps one calendar Tab stop', async () => {
  await render({ type: 'date', defaultValue: '2028-02-28', min: '2028-02-28', max: '2028-03-02', 'aria-label': 'Date' });
  await open();
  const press = async key => {
    await React.act(async () => {
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  };
  await press('ArrowRight'); assert.equal(document.activeElement.dataset.date, '2028-02-29');
  await press('ArrowRight'); assert.equal(document.activeElement.dataset.date, '2028-03-01');
  assert.equal(document.querySelectorAll('[data-date][tabindex="0"]').length, 1);
  await press('ArrowDown'); assert.equal(document.activeElement.dataset.date, '2028-03-02');
});

test('disabled fields do not open; opening a picker never submits its outer form', async () => {
  await render({ type: 'date', disabled: true, defaultValue: '2028-02-28' });
  await open(); assert.ok(!document.querySelector('[role=dialog]'));
  let submits = 0;
  await React.act(async () => root.render(React.createElement('form', { onSubmit: event => { event.preventDefault(); submits++; } },
    React.createElement(DateTimeInput, { type: 'date', defaultValue: '2028-02-28' }))));
  await open(); await apply(); assert.equal(submits, 0);
});

test('all existing app language codes can render the calendar, including ptBR and zhCN', async () => {
  for (const language of ['en', 'ko', 'cs', 'de', 'es', 'fr', 'it', 'pl', 'ptBR', 'ru', 'zhCN']) {
    globalThis.__pickerLanguage = language;
    await render({ type: 'date', defaultValue: '2028-02-28', 'aria-label': 'Date' });
    await open(); assert.equal(document.querySelectorAll('[data-date]').length, 29, language);
    await cancel(); await React.act(async () => root.unmount()); root = null;
  }
});

test('active native date/time fields use only supported ARIA attributes', async () => {
  const { default: axe } = await import('axe-core');
  for (const type of ['date', 'time', 'datetime-local']) {
    await render({ type, 'aria-label': 'Date or time' });
    const result = await axe.run(document, { runOnly: { type: 'rule', values: ['aria-allowed-attr'] } });
    assert.deepEqual(result.violations.map(violation => violation.id), [], type);
    await React.act(async () => root.unmount()); root = null;
  }
});


test('a viewport too narrow for seven touch targets opens with a focused date field', async () => {
  const original = window.matchMedia;
  window.matchMedia = () => ({ matches: true });
  try {
    let saved;
    await render({
      type: 'date', required: true, defaultValue: '2028-02-28', min: '2028-02-28',
      onChange: event => { saved = event.target.value; },
    });
    const trigger = document.querySelector('.md-date-field > button');
    trigger.focus();
    await open();
    const input = document.querySelector('.md-picker-date-text input');
    assert.equal(document.activeElement, input);
    assert.equal(document.querySelector('[data-date]'), null);
    await change(input, '2028-02-29');
    await React.act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    assert.equal(saved, '2028-02-29');
    assert.equal(document.activeElement, trigger);
  } finally {
    window.matchMedia = original;
  }
});
