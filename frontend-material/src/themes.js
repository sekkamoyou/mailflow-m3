import { Hct, SchemeTonalSpot, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

const PALETTES = {
  light: {
    primary: '#6750a4', 'on-primary': '#ffffff', 'primary-container': '#eaddff', 'on-primary-container': '#21005d',
    secondary: '#625b71', 'on-secondary': '#ffffff', 'secondary-container': '#e8def8', 'on-secondary-container': '#1d192b',
    tertiary: '#7d5260', 'on-tertiary': '#ffffff', 'tertiary-container': '#ffd8e4', 'on-tertiary-container': '#31111d',
    error: '#b3261e', 'on-error': '#ffffff', 'error-container': '#f9dedc', 'on-error-container': '#410e0b',
    background: '#fef7ff', 'on-background': '#1d1b20', surface: '#fef7ff', 'on-surface': '#1d1b20',
    'surface-variant': '#e7e0ec', 'on-surface-variant': '#49454f', 'surface-dim': '#ded8e1', 'surface-bright': '#fef7ff',
    'surface-container-lowest': '#ffffff', 'surface-container-low': '#f7f2fa', 'surface-container': '#f3edf7',
    'surface-container-high': '#ece6f0', 'surface-container-highest': '#e6e0e9',
    outline: '#79747e', 'outline-variant': '#cac4d0', shadow: '#000000', scrim: '#000000',
    'inverse-surface': '#313033', 'inverse-on-surface': '#f4eff4', 'inverse-primary': '#d0bcff',
  },
  dark: {
    primary: '#d0bcff', 'on-primary': '#381e72', 'primary-container': '#4f378b', 'on-primary-container': '#eaddff',
    secondary: '#ccc2dc', 'on-secondary': '#332d41', 'secondary-container': '#4a4458', 'on-secondary-container': '#e8def8',
    tertiary: '#efb8c8', 'on-tertiary': '#492532', 'tertiary-container': '#633b48', 'on-tertiary-container': '#ffd8e4',
    error: '#f2b8b5', 'on-error': '#601410', 'error-container': '#8c1d18', 'on-error-container': '#f9dedc',
    background: '#141218', 'on-background': '#e6e0e9', surface: '#141218', 'on-surface': '#e6e0e9',
    'surface-variant': '#49454f', 'on-surface-variant': '#cac4d0', 'surface-dim': '#141218', 'surface-bright': '#3b383e',
    'surface-container-lowest': '#0f0d13', 'surface-container-low': '#1d1b20', 'surface-container': '#211f26',
    'surface-container-high': '#2b2930', 'surface-container-highest': '#36343b',
    outline: '#938f99', 'outline-variant': '#49454f', shadow: '#000000', scrim: '#000000',
    'inverse-surface': '#e6e0e9', 'inverse-on-surface': '#313033', 'inverse-primary': '#6750a4',
  },
};

function legacyVars(roles, dark) {
  return {
    '--bg-primary': roles.surface, '--bg-secondary': roles['surface-container-lowest'],
    '--bg-tertiary': roles['surface-container'], '--bg-elevated': roles['surface-container-low'],
    '--bg-hover': roles['surface-container-high'], '--border': roles['outline-variant'],
    '--border-subtle': roles['outline-variant'], '--text-primary': roles['on-surface'],
    '--text-secondary': roles['on-surface-variant'], '--text-tertiary': roles['on-surface-variant'],
    '--accent': roles.primary, '--accent-text': roles['on-primary'], '--accent-dim': roles['primary-container'],
    '--accent-glow': 'color-mix(in srgb, var(--md-sys-color-primary) 12%, transparent)',
    '--green': dark ? '#6dd58c' : '#146c2e', '--red': roles.error, '--amber': dark ? '#e5c45c' : '#7a5900',
  };
}

function makeTheme(key, label, description, palette = PALETTES[key]) {
  const vars = Object.fromEntries(Object.entries(palette).map(([name, value]) => ['--md-sys-color-' + name, value]));
  return {
    label, description,
    preview: [palette.surface, palette['surface-container-high'], palette.primary, palette['on-surface']],
    vars: { ...vars, ...legacyVars(palette, key === 'dark') },
  };
}

export const THEMES = {
  system: { ...makeTheme('light', 'System', 'Match the device appearance') },
  light: makeTheme('light', 'Light'),
  dark: makeTheme('dark', 'Dark'),
};

function generatePalette(seed) {
  return Object.fromEntries(['light', 'dark'].map(mode => {
    const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), mode === 'dark', 0);
    const roles = Object.fromEntries(Object.keys(PALETTES[mode]).map(role => [
      role, hexFromArgb(scheme[role.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]),
    ]));
    return [mode, makeTheme(mode, undefined, undefined, roles)];
  }));
}

export const COLOR_PALETTES = Object.fromEntries([
  ['purple', '#6750a4', 'material.palettes.purple'],
  ['blue', '#0061a4', 'material.palettes.blue'],
  ['teal', '#006a6a', 'material.palettes.teal'],
  ['green', '#386a20', 'material.palettes.green'],
  ['orange', '#9c4300', 'material.palettes.orange'],
  ['rose', '#984061', 'material.palettes.rose'],
].map(([key, seed, labelKey]) => {
  const modes = key === 'purple' ? THEMES : generatePalette(seed);
  return [key, { labelKey, ...modes }];
}));

export function normalizeSeedColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
}

export function normalizeColorPalette(name) {
  return normalizeSeedColor(name) || (Object.hasOwn(COLOR_PALETTES, name) ? name : 'purple');
}

let customPaletteSeed;
let customPalette;
export function getTheme(themeName, paletteName = 'purple') {
  const name = normalizeColorPalette(paletteName);
  if (name.startsWith('#')) {
    // Keep only the current custom palette so color-picker edits cannot grow a cache.
    if (customPaletteSeed !== name) {
      customPalette = generatePalette(name);
      customPaletteSeed = name;
    }
    return customPalette[resolveEffectiveTheme(themeName)];
  }
  return COLOR_PALETTES[name][resolveEffectiveTheme(themeName)];
}

// ── Favicon color helpers ───────────────────────────────────────────────────

function buildFaviconSvg(accent, count = 0) {
  const container = getTheme(_activeTheme, _activePalette).vars['--md-sys-color-primary-container'];

  let badge = '';
  if (count > 0) {
    const label = count > 99 ? '99+' : String(count);
    const r  = label.length > 2 ? 10 : 11;
    const cx = 32 - r;
    const cy = r;
    const fs = label.length > 2 ? 8 : label.length > 1 ? 12 : 14;
    badge = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" stroke="white" stroke-width="1.5"/>` +
            `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
            `fill="white" font-family="system-ui,sans-serif" font-weight="800" font-size="${fs}">${label}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="8" fill="${container}"/>
  <rect x="6" y="9" width="20" height="14" rx="2" fill="${accent}"/>
  <path d="M7 10.5 16 17 25 10.5" fill="none" stroke="${container}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  ${badge}
</svg>`;
}


const SENDER_PALETTE = [
  '#dc2626', // red
  '#ea580c', // orange
  '#d97706', // amber
  '#65a30d', // lime
  '#16a34a', // green
  '#059669', // emerald
  '#0d9488', // teal
  '#0891b2', // cyan
  '#0284c7', // sky
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#9333ea', // purple
  '#c026d3', // fuchsia
  '#db2777', // pink
  '#e11d48', // rose
];

function hashIndex(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % SENDER_PALETTE.length;
}

export function senderColor(email) {
  const key = (email || '').toLowerCase().trim();
  return SENDER_PALETTE[key ? hashIndex(key) : 0];
}

// ── Custom CSS injection ───────────────────────────────────────────────────────

const CUSTOM_CSS_ID = 'mailflow-custom-css';

export function applyCustomCss(css) {
  void css;
  document.getElementById(CUSTOM_CSS_ID)?.remove();
}

// ── Theme application ─────────────────────────────────────────────────────────

let _activeTheme = 'system';
let _activePalette = 'purple';
let _mediaQueryListenerAttached = false;

function _onSystemThemeChange() {
  if (_activeTheme === 'system') {
    applyTheme('system');
  }
}

// Returns the concrete theme name ('light', 'dark', etc.) for a theme key.
// When given 'system', inspects the OS light/dark preference.
export function resolveEffectiveTheme(themeName) {
  if (themeName === 'system') {
    try {
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    } catch { /* matchMedia unavailable — fall through to dark */ }
    return 'dark';
  }
  return themeName === 'light' || themeName === 'dark' ? themeName : 'dark';
}

// The theme to use before any stored/server preference is known — i.e. on the
// login screen and the very first visit. Honors the OS light/dark setting via 'system'.
export function getInitialTheme() {
  return 'system';
}

// ── Effective accent (theme value, or a custom-CSS override of --accent) ───────

// The accent actually in effect. A custom-CSS override of --accent wins over the
// theme's declared value, so JS-driven chrome (favicon and the logo
// mark) reads the *computed* value to match what var(--accent) resolves to in CSS.
export function getEffectiveAccent(fallback = '#6750a4') {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return v || fallback;
  } catch { return fallback; }
}

// Subscribers (e.g. the logo mark) notified when the effective accent changes, so
// they update on a custom-CSS accent override too — not only on a theme switch.
const _accentListeners = new Set();
export function subscribeAccent(fn) {
  _accentListeners.add(fn);
  return () => { _accentListeners.delete(fn); };
}

// Recompute the favicon and logo from the effective accent.
function refreshAccentDerived() {
  const accent = getEffectiveAccent();
  if (!accent.startsWith('#')) return; // favicon rasteriser expects a hex colour
  // Only invalidate the base favicon cache when the accent actually changed — the
  // double applyTheme at startup (localStorage then server prefs) usually repeats it.
  if (_baseAccent !== accent) {
    _baseCanvas = null;
    _baseAccent = null;
  }
  _applyFavicon(accent);
  if (_badgeCount > 0) _warmBase(accent);
  _accentListeners.forEach(fn => {
    try { fn(accent); } catch { /* a listener error must not break theming */ }
  });
}

export function applyTheme(themeName, paletteName = _activePalette) {
  _activeTheme = ['system', 'light', 'dark'].includes(themeName) ? themeName : 'system';
  _activePalette = normalizeColorPalette(paletteName);
  document.getElementById(CUSTOM_CSS_ID)?.remove();

  if (!_mediaQueryListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener?.('change', _onSystemThemeChange);
      _mediaQueryListenerAttached = true;
    } catch { /* matchMedia listener unavailable */ }
  }

  const effectiveKey = resolveEffectiveTheme(_activeTheme);
  const theme = getTheme(effectiveKey, _activePalette);

  // Expose the active theme as an attribute so a theme can layer scoped skeuomorphic
  // chrome (beveled scrollbars, selection tint) via CSS in index.css without adding
  // structural tokens to every palette. Retro themes (winxp/win9x) use this.
  document.documentElement.setAttribute('data-material-theme', effectiveKey);
  document.documentElement.setAttribute('data-material-palette', _activePalette);
  document.documentElement.setAttribute('data-mailflow-theme', effectiveKey);

  // Apply the M3 baseline palette while keeping legacy app variables as aliases.
  let themeEl = document.getElementById('mailflow-theme');
  if (!themeEl) {
    themeEl = document.createElement('style');
    themeEl.id = 'mailflow-theme';
    document.head.appendChild(themeEl);
  }

  if (_activeTheme === 'system') {
    themeEl.textContent = `:root[data-material-theme][data-material-palette] {\n${
      Object.entries(getTheme('dark', _activePalette).vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    }\n  color-scheme: dark;\n}\n@media (prefers-color-scheme: light) {\n  :root[data-material-theme][data-material-palette] {\n${
      Object.entries(getTheme('light', _activePalette).vars).map(([k, v]) => `    ${k}: ${v};`).join('\n')
    }\n    color-scheme: light;\n  }\n}`;
  } else {
    themeEl.textContent = `:root[data-material-theme][data-material-palette] {\n${
      Object.entries(theme.vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    }\n  color-scheme: ${effectiveKey === 'light' ? 'light' : 'dark'};\n}`;
  }

  // Chromium also uses this color to choose status-bar icons over edge-to-edge content.
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', theme.vars['--bg-primary']);
  });

  // Keep the favicon in step with the active Material primary color.
  refreshAccentDerived();
}

// ── Favicon badge ─────────────────────────────────────────────────────────────

const FAVICON_PX = 32;
let _badgeCount  = 0;
let _renderSeq   = 0;
let _appliedSeq  = 0;

// Cached rasterization of the base favicon (envelope icon, no badge).
// Once populated, badge updates are drawn synchronously with Canvas 2D —
// no SVG → Image → onload round-trip needed.
let _baseCanvas = null;
let _baseAccent = null;

// Persistent <link rel="icon"> element. We update href in-place rather than
// removing/adding the element each time. DOM remove+add causes Chrome to briefly
// show no favicon between the two mutations, making updates appear sluggish.
let _faviconLink = null;

function _setFaviconLink(dataUri) {
  if (!_faviconLink || !_faviconLink.isConnected) {
    // Reuse the existing icon element from index.html on first call so Chrome
    // processes a href change on a known element rather than discovering a new one.
    _faviconLink = document.querySelector("link[rel='icon']") || (() => {
      const el = document.createElement('link');
      el.rel = 'icon';
      document.head.appendChild(el);
      return el;
    })();
    // Remove any competing icon links (e.g. a second link added by HMR or SSR)
    // but leave apple-touch-icon and other non-standard rel values alone.
    document.querySelectorAll("link[rel='icon']").forEach(l => {
      if (l !== _faviconLink) l.remove();
    });
  }
  _faviconLink.type = 'image/png';
  _faviconLink.href = dataUri;
}

function _rasterise(svgStr, onCanvas) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const img  = new Image(FAVICON_PX, FAVICON_PX);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_PX;
    canvas.height = FAVICON_PX;
    canvas.getContext('2d').drawImage(img, 0, 0, FAVICON_PX, FAVICON_PX);
    onCanvas(canvas);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function _warmBase(accent) {
  if (_baseCanvas && _baseAccent === accent) return;
  _rasterise(buildFaviconSvg(accent, 0), (canvas) => {
    if (_baseCanvas && _baseAccent === accent) return; // lost the race
    _baseCanvas = canvas;
    _baseAccent = accent;
  });
}

function _applyFavicon(accent) {
  // Rasterise the SVG to a canvas and export as PNG. PNG data URIs go through
  // the browser's image pipeline rather than the document pipeline, which avoids
  // the Chromium quirk where SVG favicons are silently reverted to the cached
  // on-disk file after tab focus changes.
  const isBase = _badgeCount === 0; // capture before any async gap
  const seq    = ++_renderSeq;
  _rasterise(buildFaviconSvg(accent, _badgeCount), (canvas) => {
    // Cache the no-badge render as the base so all future badge updates can
    // skip the async round-trip and draw synchronously via Canvas 2D.
    // Do this before the seq guard so the cache is always populated, even
    // if a later render has already applied its result to the DOM.
    if (isBase && !_baseCanvas) {
      _baseCanvas = canvas;
      _baseAccent = accent;
    }

    // Only skip this render if a *later* render already applied its result.
    if (seq < _appliedSeq) return;
    _appliedSeq = seq;
    _setFaviconLink(canvas.toDataURL('image/png'));
  });
}

export function updateFaviconBadge(count) {
  _badgeCount = count;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (!accent || !accent.startsWith('#')) return;

  // Fast synchronous path: base favicon is cached — composite badge directly.
  if (_baseCanvas && _baseAccent === accent) {
    // Advance the sequence counter so any in-flight slow-path renders that
    // complete later are treated as stale and don't overwrite this result.
    _appliedSeq = ++_renderSeq;

    const canvas = document.createElement('canvas');
    canvas.width  = FAVICON_PX;
    canvas.height = FAVICON_PX;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(_baseCanvas, 0, 0);

    if (count > 0) {
      const label = count > 99 ? '99+' : String(count);
      const r  = label.length > 2 ? 10 : 11;
      const cx = FAVICON_PX - r;
      const cy = r;
      const fs = label.length > 2 ? 8 : label.length > 1 ? 12 : 14;
      // White border (filled circle, slightly larger than the badge)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = 'white';
      ctx.fill();
      // Red badge
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      // White label
      ctx.fillStyle = 'white';
      ctx.font = `800 ${fs}px system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + 0.5);
    }

    _setFaviconLink(canvas.toDataURL('image/png'));
    return;
  }

  // Slow path: base not cached yet (first render or theme change) — use async
  // SVG rasterization. Also warm the base cache separately so the next badge
  // update can use the fast synchronous path, even if _badgeCount > 0 now
  // (which would prevent _applyFavicon from auto-caching the base).
  _applyFavicon(accent);
  if (_badgeCount > 0) _warmBase(accent);
}
