import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { COLOR_PALETTES, getTheme } from '../themes.js';
registerHooks({ load(url, context, next) {
  if (url.endsWith('.jsx')) return { format: 'module', shortCircuit: true, source: transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic' }).code };
  return next(url, context);
} });
const { MaterialButton, MaterialInput, MaterialProgress, MaterialSelect } = await import('./controls.jsx');
const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; });
const render = async el => { root = createRoot(document.getElementById('root')); await React.act(async () => root.render(el)); };
test('native form submit, required validation attributes and input ref are retained', async () => {
  let submits = 0; const ref = React.createRef();
  await render(React.createElement('form', { onSubmit: e => { e.preventDefault(); submits++; } },
    React.createElement(MaterialInput, { ref, name: 'email', type: 'email', required: true, defaultValue: 'qa@example.invalid', 'aria-label': 'Email' }),
    React.createElement(MaterialButton, { type: 'submit', variant: 'filled' }, 'Send')));
  assert.equal(ref.current.tagName, 'INPUT'); assert.equal(ref.current.required, true);
  await React.act(async () => document.querySelector('button').click()); assert.equal(submits, 1);
});
test('disabled, selected and switch states retain native accessibility semantics', async () => {
  let clicks = 0;
  await render(React.createElement(MaterialButton, { disabled: true, role: 'switch', 'aria-checked': true, 'aria-label': 'Notifications', onClick: () => clicks++ }));
  const button = document.querySelector('button'); button.click();
  assert.equal(clicks, 0); assert.equal(button.getAttribute('aria-checked'), 'true'); assert.equal(button.dataset.variant, 'switch');
});
test('checkbox stays a native checkbox and reports controlled changes', async () => {
  let checked = null;
  await render(React.createElement(MaterialInput, { type: 'checkbox', defaultChecked: false, 'aria-label': 'Remember', onChange: e => { checked = e.target.checked; }, style: { width: 12, height: 12 } }));
  await React.act(async () => document.querySelector('input').click());
  assert.equal(checked, true); assert.equal(document.querySelector('input').style.width, '');
});
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
test('light/dark text color pairs meet WCAG AA contrast', () => {
  const seeds = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#123456', '#abcdef'];
  const palettes = [...Object.entries(COLOR_PALETTES), ...seeds.map(seed => [seed, { light: getTheme('light', seed), dark: getTheme('dark', seed) }])];
  for (const [palette, modes] of palettes) {
    for (const key of ['light', 'dark']) {
      const colors = modes[key].vars;
      for (const role of ['primary', 'secondary', 'tertiary', 'primary-container', 'secondary-container', 'tertiary-container', 'error', 'error-container', 'surface', 'surface-variant']) {
        const a = luminance(colors[`--md-sys-color-${role}`]); const b = luminance(colors[`--md-sys-color-on-${role}`]);
        assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, `${palette}/${key}: ${role}`);
      }
    }
  }
});

test('GTD semantic text/container pairs meet AA in both themes', () => {
  const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
  const sections = [...css.matchAll(/:root[^{]*\{([^}]*--gtd-color-todo[^}]*)\}/g)].map(match => match[1]);
  assert.equal(sections.length, 2);
  for (const section of sections) {
    const colors = Object.fromEntries([...section.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(match => [match[1], match[2]]));
    for (const state of ['todo', 'watch', 'delegated', 'done']) {
      const fg = luminance(colors[state === 'done' ? '--green' : `--gtd-color-${state}`]);
      const bg = luminance(colors[`--gtd-container-${state}`]);
      assert.ok((Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) >= 4.5, state);
    }
  }
});

// jsdom does not resolve layout; pin the shared geometry and also inspect it in browser QA.
test('icon visual container plus its input extension is 48px', () => {
  const css = readFileSync(new URL('./controls.css', import.meta.url), 'utf8');
  assert.match(css, /\.md-button\[data-variant=icon\] \{[^}]*width: 40px;[^}]*height: 40px;/);
  assert.match(css, /\.md-button\[data-variant=icon\]::before \{ inset: -4px; \}/);
});

test('account color choices retain their swatch and accessible name', async () => {
  await render(React.createElement(MaterialButton, { style: { background: '#6750a4' }, selected: true }));
  const button = document.querySelector('button');
  assert.ok(button.getAttribute('aria-label').includes('#6750a4'));
  assert.equal(button.dataset.selected, 'true');
  assert.equal(button.querySelector('.md-color-swatch').style.background, 'rgb(103, 80, 164)');
});

test('pointer and keyboard ripple preserve caller handlers and respect reduced motion', async () => {
  let calls = 0; let animations = 0;
  await render(React.createElement(MaterialButton, { onPointerDown: () => calls++ }, 'Action'));
  const button = document.querySelector('button');
  const circle = button.querySelector('.md-ripple-circle');
  circle.getAnimations = () => [];
  circle.animate = () => { animations++; };
  await React.act(async () => button.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true })));
  assert.equal(calls, 1); assert.equal(animations, 1);
  await React.act(async () => button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.equal(animations, 2);
  window.matchMedia = () => ({ matches: true });
  await React.act(async () => button.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })));
  assert.equal(animations, 2);
  delete window.matchMedia;
});

test('range uses its numeric bounds and keeps native input events and refs', async () => {
  const ref = React.createRef(); let input;
  await render(React.createElement(MaterialInput, { ref, type: 'range', min: 80, max: 130, defaultValue: 105, 'aria-label': 'Text size', onInput: e => { input = e.target.value; } }));
  assert.equal(ref.current.type, 'range');
  assert.equal(ref.current.dataset.material, 'slider');
  assert.equal(ref.current.style.getPropertyValue('--md-slider-progress'), '50%');
  ref.current.value = '130';
  await React.act(async () => ref.current.dispatchEvent(new window.Event('input', { bubbles: true })));
  assert.equal(input, '130');
  assert.equal(ref.current.style.getPropertyValue('--md-slider-progress'), '100%');
});

test('button hierarchy uses explicit variants instead of legacy paint', async () => {
  await render(React.createElement(MaterialButton, { style: { background: 'var(--accent)' } }, 'Action'));
  assert.equal(document.querySelector('button').dataset.variant, 'text');
});

test('progress exposes a name and known progress, with no invented percentage while loading', async () => {
  await render(React.createElement(MaterialProgress, { value: .75, label: 'Upload' }));
  const progress = document.querySelector('[role=progressbar]');
  assert.equal(progress.getAttribute('aria-label'), 'Upload');
  assert.equal(progress.getAttribute('aria-valuenow'), '75');
  await React.act(async () => root.render(React.createElement(MaterialProgress, { label: 'Loading' })));
  assert.equal(progress.getAttribute('aria-valuenow'), null);
  assert.equal(progress.dataset.indeterminate, 'true');
});

test('an associated external label is not overridden by example placeholder text', async () => {
  await render(React.createElement('label', { htmlFor: 'server' }, 'IMAP server',
    React.createElement(MaterialInput, { id: 'server', placeholder: 'imap.example.invalid' })));
  assert.equal(document.querySelector('input').getAttribute('aria-label'), null);
  assert.equal(document.querySelector('input').labels.length, 1);
});

test('composed selection cards retain their label, toggle state and disabled behavior', async () => {
  let changes = 0;
  function Choice() {
    const [selected, setSelected] = React.useState(false);
    return React.createElement(MaterialButton, { variant: 'card', 'aria-pressed': selected, onClick: () => { changes++; setSelected(value => !value); } },
      React.createElement('span', null, 'Choice'), React.createElement('span', null, 'Supporting description'));
  }
  await render(React.createElement(Choice));
  const button = document.querySelector('button');
  await React.act(async () => button.click());
  assert.equal(changes, 1); assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.dataset.selected, 'true'); assert.match(button.textContent, /Supporting description/);
  await React.act(async () => root.render(React.createElement(MaterialButton, { variant: 'card', disabled: true, onClick: () => changes++ }, 'Disabled')));
  await React.act(async () => document.querySelector('button').click());
  assert.equal(changes, 1);
});

test('Escape on an open native select reaches its picker before the parent dialog', async () => {
  const originalCSS = globalThis.CSS;
  globalThis.CSS = { supports: () => true };
  let escaped = 0, open = true;
  try {
    await render(React.createElement('div', { onKeyDown: event => { if (event.key === 'Escape') escaped++; } },
      React.createElement(MaterialSelect, null, React.createElement('option', { value: 'one' }, 'One'))));
    const select = document.querySelector('select');
    const matches = select.matches;
    select.matches = selector => selector === ':open' ? open : matches.call(select, selector);
    const key = () => new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const first = key();
    await React.act(async () => select.dispatchEvent(first));
    assert.equal(escaped, 0);
    assert.equal(first.defaultPrevented, false, 'native picker still receives its dismissal');
    open = false;
    await React.act(async () => select.dispatchEvent(key()));
    assert.equal(escaped, 1, 'a later Escape can close the parent');
  } finally { globalThis.CSS = originalCSS; }
});
