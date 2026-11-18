import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import config from '../vite.config.js';
import { getTheme } from './themes.js';

test('initial browser chrome and manifest use Material surfaces before JavaScript runs', () => {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  try {
    const colors = [...dom.window.document.querySelectorAll('meta[name="theme-color"]')];
    assert.deepEqual(colors.map(meta => [meta.getAttribute('media') || '', meta.content]), [
      ['(prefers-color-scheme: dark)', getTheme('dark').vars['--bg-primary']],
      ['', getTheme('light').vars['--bg-primary']],
    ]);
    const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
    assert.equal(manifest.theme_color, getTheme('light').vars['--bg-primary']);
    assert.equal(manifest.background_color, manifest.theme_color);
    assert.equal(manifest.display, 'standalone');
  } finally { dom.window.close(); }
});

test('Material development server proxies backend routes without changing browser Origin', () => {
  const { server } = config;
  assert.equal(server.port, 5174);
  assert.equal(server.strictPort, true);
  for (const path of ['/api', '/oauth', '/auth/oidc', '/carddav', '/.well-known/carddav', '/ws']) {
    assert.equal(server.proxy[path].target, process.env.MAILFLOW_BACKEND_URL || 'http://127.0.0.1:3000');
    assert.equal(server.proxy[path].changeOrigin, undefined);
  }
  assert.equal(server.proxy['/ws'].ws, true);
});
