import { query } from './db.js';

export const DEFAULT_APP_NAME = 'MailFlow M3';

export function validateAppDisplayName(value) {
  if (typeof value !== 'string') throw new TypeError('App name must be text.');
  const name = value.trim() || DEFAULT_APP_NAME;
  if (Array.from(name).length > 60 || Array.from(name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new TypeError('App name must contain at most 60 characters and no control characters.');
  }
  return name;
}

export function storedAppDisplayName(value) {
  try { return validateAppDisplayName(value); } catch { return DEFAULT_APP_NAME; }
}

export async function getAppDisplayName() {
  const result = await query("SELECT value FROM system_settings WHERE key = 'app_display_name'");
  return storedAppDisplayName(result.rows[0]?.value);
}

export function materialManifest(name) {
  return {
    id: '/', name, short_name: name, start_url: '/', scope: '/', display: 'standalone',
    background_color: '#fef7ff', theme_color: '#fef7ff', orientation: 'portrait-primary',
    protocol_handlers: [{ protocol: 'mailto', url: '/?mailto=%s' }],
    icons: [
      { src: '/icon-192.png?v=material-2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=material-2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png?v=material-2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/badge-96.png?v=material-2', sizes: '96x96', type: 'image/png', purpose: 'monochrome' },
    ],
  };
}
