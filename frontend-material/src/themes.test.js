import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { THEMES, COLOR_PALETTES, getTheme, normalizeColorPalette, normalizeSeedColor, applyCustomCss, applyTheme, getInitialTheme, resolveEffectiveTheme, updateFaviconBadge } from './themes.js';
const tokens = readFileSync(fileURLToPath(new URL('./material/tokens.css', import.meta.url)), 'utf8');

const requiredRoles = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'background', 'on-background', 'surface', 'on-surface', 'surface-variant',
  'on-surface-variant', 'surface-dim', 'surface-bright', 'surface-container-lowest',
  'surface-container-low', 'surface-container', 'surface-container-high',
  'surface-container-highest', 'outline', 'outline-variant', 'shadow', 'scrim',
  'inverse-surface', 'inverse-on-surface', 'inverse-primary',
];

describe('Material 3 theme contract', () => {
  it('accepts only complete HEX seeds and generates all roles for extreme and chromatic colors', () => {
    assert.equal(normalizeSeedColor(' #AaBbCc '), '#aabbcc');
    assert.equal(normalizeColorPalette('#AaBbCc'), '#aabbcc');
    for (const invalid of [null, '#fff', '#zzzzzz', 'red', '#123456;}', '#12345678', 123456]) assert.equal(normalizeSeedColor(invalid), null);
    for (const seed of ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#123456', '#abcdef']) {
      for (const mode of ['light', 'dark']) for (const role of requiredRoles) assert.match(getTheme(mode, seed).vars['--md-sys-color-' + role], /^#[0-9a-f]{6}$/i);
    }
    assert.ok(getTheme('light', '#aabbcc') === getTheme('light', '#AABBCC'));
  });
  it('provides six complete light/dark palettes and safely rejects unknown names', () => {
    assert.equal(Object.keys(COLOR_PALETTES).length, 6);
    for (const key of Object.keys(COLOR_PALETTES)) {
      for (const mode of ['light', 'dark']) {
        const vars = getTheme(mode, key).vars;
        for (const role of requiredRoles) assert.match(vars['--md-sys-color-' + role], /^#[0-9a-f]{6}$/i, `${key}/${mode}/${role}`);
        assert.equal(vars['--accent'], vars['--md-sys-color-primary']);
        assert.equal(vars['--bg-primary'], vars['--md-sys-color-surface']);
      }
    }
    for (const invalid of [null, 'missing', '__proto__', 'toString']) assert.equal(normalizeColorPalette(invalid), 'purple');
    assert.equal(getTheme('light', 'missing').vars['--accent'], '#6750a4');
  });
  it('offers only system, light, and dark appearance choices', () => {
    assert.deepEqual(Object.keys(THEMES), ['system', 'light', 'dark']);
  });

  it('defines every baseline color role with a paired foreground', () => {
    for (const name of ['light', 'dark']) {
      for (const role of requiredRoles) {
        assert.match(THEMES[name].vars['--md-sys-color-' + role], /^#[0-9a-f]{6}$/i, name + ' is missing ' + role);
      }
    }
    assert.equal(THEMES.light.vars['--md-sys-color-primary'], '#6750a4');
    assert.equal(THEMES.light.vars['--md-sys-color-on-primary'], '#ffffff');
    assert.equal(THEMES.dark.vars['--md-sys-color-primary'], '#d0bcff');
  });

  it('keeps legacy surface aliases concrete for email dark-mode detection', () => {
    assert.equal(THEMES.light.vars['--bg-primary'], '#fef7ff');
    assert.equal(THEMES.dark.vars['--bg-primary'], '#141218');
  });

  it('keeps both CSS palettes aligned with the shared role values', () => {
    for (const name of ['light', 'dark']) {
      for (const role of requiredRoles) {
        const value = THEMES[name].vars['--md-sys-color-' + role];
        assert.ok(tokens.includes('--md-sys-color-' + role + ': ' + value + ';'), name + ' CSS is missing ' + role);
      }
    }
  });

  it('defines Material shape, elevation, motion, and typescale tokens', () => {
    for (const token of [
      '--md-sys-shape-corner-small', '--md-sys-shape-corner-full',
      '--md-sys-elevation-level1', '--md-sys-elevation-level5',
      '--md-sys-motion-duration-short', '--md-sys-motion-easing-standard',
      '--md-sys-motion-fast-spatial', '--md-sys-motion-fast-effects',
      '--md-sys-motion-default-spatial-standard', '--md-sys-typescale-label-large-emphasized-weight',
      '--md-sys-typescale-display-large-size', '--md-sys-typescale-body-medium-line-height',
    ]) assert.ok(tokens.includes(token + ':'), 'missing ' + token);
    assert.match(tokens, /prefers-reduced-motion:\s*reduce/);
  });
});

describe('system preference', () => {
  it('uses system before the user selects a Material appearance', () => {
    assert.equal(getInitialTheme(), 'system');
  });

  it('resolves the OS preference and rejects unknown theme keys', () => {
    const originalWindow = globalThis.window;
    try {
      globalThis.window = { matchMedia: () => ({ matches: true }) };
      assert.equal(resolveEffectiveTheme('system'), 'light');
      globalThis.window = { matchMedia: () => ({ matches: false }) };
      assert.equal(resolveEffectiveTheme('system'), 'dark');
      assert.equal(resolveEffectiveTheme('unsupported-upstream-theme'), 'dark');
    } finally {
      globalThis.window = originalWindow;
    }
  });
});

describe('upstream custom CSS isolation', () => {
  it('removes a previously injected stylesheet without applying its contents', () => {
    const originalDocument = globalThis.document;
    let removed = false;
    globalThis.document = { getElementById: id => id === 'mailflow-custom-css' ? { remove: () => { removed = true; } } : null };
    try {
      applyCustomCss(':root { --md-sys-color-primary: red }');
      assert.equal(removed, true);
    } finally {
      globalThis.document = originalDocument;
    }
  });
});

describe('Material theme browser chrome', () => {
  it('uses the surface for browser chrome and the accent for favicons across palettes and theme changes', async () => {
    const dom = new JSDOM(`<!doctype html><style>${tokens}</style><meta name="theme-color" media="(prefers-color-scheme: dark)"><meta name="theme-color"><link rel="icon" href="/favicon.svg">`, { url: 'https://mail.example.invalid' });
    const globals = {
      window: globalThis.window,
      document: globalThis.document,
      getComputedStyle: globalThis.getComputedStyle,
      Image: globalThis.Image,
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
    };
    class ImmediateImage {
      set src(value) { this.onload?.(); }
    }
    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
      drawImage() {}, beginPath() {}, arc() {}, fill() {}, fillText() {},
    });
    dom.window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,material-favicon';
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.getComputedStyle = dom.window.getComputedStyle;
    globalThis.Image = ImmediateImage;
    const blobs = [];
    URL.createObjectURL = blob => { blobs.push(blob); return 'blob:material-favicon'; };
    let light = false;
    let systemChange;
    dom.window.matchMedia = () => ({ matches: light, addEventListener: (_, fn) => { systemChange = fn; } });
    URL.revokeObjectURL = () => {};
    const assertSurface = (mode, palette) => {
      const vars = getTheme(mode, palette).vars;
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
        assert.equal(meta.content, vars['--bg-primary']);
        assert.notEqual(meta.content, vars['--accent']);
      }
    };
    try {
      applyTheme('light', 'purple');
      assertSurface('light', 'purple');
      assert.equal(document.querySelector('link[rel="icon"]').href, 'data:image/png;base64,material-favicon');
      updateFaviconBadge(4);
      assert.equal(document.querySelector('link[rel="icon"]').href, 'data:image/png;base64,material-favicon');
      applyTheme('light', 'blue');
      assertSurface('light', 'blue');
      assert.ok((await blobs.at(-1).text()).includes(getTheme('light', 'blue').vars['--md-sys-color-primary-container']));
      applyTheme('dark');
      for (const role of requiredRoles) assert.equal(getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-' + role).trim(), getTheme('dark', 'blue').vars['--md-sys-color-' + role]);
      assert.equal(document.documentElement.dataset.materialPalette, 'blue');
      assertSurface('dark', 'blue');
      applyTheme('system');
      assertSurface('dark', 'blue');
      assert.ok(document.getElementById('mailflow-theme').textContent.includes(getTheme('light', 'blue').vars['--accent']));
      light = true;
      systemChange();
      assert.equal(document.documentElement.dataset.materialTheme, 'light');
      assert.equal(document.documentElement.dataset.materialPalette, 'blue');
      assertSurface('light', 'blue');
      light = false;
      systemChange();
      assertSurface('dark', 'blue');
      light = true;
      applyTheme('dark', '#123456');
      assert.equal(document.documentElement.dataset.materialPalette, '#123456');
      assertSurface('dark', '#123456');
      systemChange();
      assertSurface('dark', '#123456');
      assert.ok((await blobs.at(-1).text()).includes(getTheme('dark', '#123456').vars['--md-sys-color-primary-container']));
      for (const palette of [...Object.keys(COLOR_PALETTES), '#000000', '#ffffff', '#123456']) {
        for (const mode of ['light', 'dark']) {
          applyTheme(mode, palette);
          assertSurface(mode, palette);
        }
      }
    } finally {
      globalThis.window = globals.window;
      globalThis.document = globals.document;
      globalThis.getComputedStyle = globals.getComputedStyle;
      globalThis.Image = globals.Image;
      URL.createObjectURL = globals.createObjectURL;
      URL.revokeObjectURL = globals.revokeObjectURL;
      dom.window.close();
    }
  });
});
