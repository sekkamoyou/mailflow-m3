import { withTransaction } from './db.js';

const DEFAULT_PROFILE = { theme: 'system', colorPalette: 'purple', customColor: '#6750a4', displayName: '' };
const PALETTES = ['purple', 'blue', 'teal', 'green', 'orange', 'rose'];
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateAppearanceOperation(value) {
  if (!object(value) || !['mobile', 'desktop'].includes(value.device) || typeof value.ownerId !== 'string') return false;
  if (Object.keys(value).some(key => !['ownerId', 'device', 'initialize', 'mode', 'changes', 'target'].includes(key))) return false;
  if (value.changes !== undefined && !['shared', value.device].includes(value.target)) return false;
  if (value.mode !== undefined && !['shared', 'separate'].includes(value.mode)) return false;
  if (value.initialize !== undefined && (value.changes !== undefined || value.mode !== undefined)) return false;
  for (const profile of [value.initialize, value.changes]) {
    if (profile === undefined) continue;
    if (!object(profile) || !Object.keys(profile).length) return false;
    for (const [key, field] of Object.entries(profile)) {
      if (key === 'theme' && ['system', 'light', 'dark'].includes(field)) continue;
      if (key === 'colorPalette' && (PALETTES.includes(field) || typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field))) continue;
      if (key === 'customColor' && typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field)) continue;
      if (key === 'displayName' && typeof field === 'string' && [...field].length <= 60
        && ![...field].some(char => char.codePointAt(0) < 32 || (char.codePointAt(0) >= 127 && char.codePointAt(0) <= 159))
        && !/[\u202a-\u202e\u2066-\u2069]/u.test(field)) continue;
      return false;
    }
  }
  return value.initialize !== undefined || value.mode !== undefined || value.changes !== undefined;
}

export function mergeAppearance(current, operation) {
  if (operation.initialize && current) return current;
  const next = current ? structuredClone(current) : { mode: 'shared', shared: { ...DEFAULT_PROFILE, ...operation.initialize }, revision: 0 };
  const { device, mode, changes } = operation;
  if (mode === 'separate' && next.mode !== 'separate') {
    // Retain both separated profiles across shared-mode visits; seed only missing ones.
    next.mobile ||= { ...next.shared };
    next.desktop ||= { ...next.shared };
  } else if (mode === 'shared' && next.mode === 'separate') {
    next.shared = { ...next[device] };
  }
  if (mode) next.mode = mode;
  if (changes) {
    const target = operation.target;
    next[target] = { ...next.shared, ...next[target], ...changes };
    if ('displayName' in changes) next[target].displayName = changes.displayName.trim();
  }
  next.revision = (next.revision || 0) + 1;
  return next;
}

export async function saveMaterialAppearance(userId, operation) {
  return withTransaction(async client => {
    const { rows } = await client.query('SELECT preferences FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!rows.length) throw new Error('User not found');
    const current = rows[0].preferences?.materialAppearance;
    const next = mergeAppearance(current, operation);
    if (next !== current) {
      await client.query(`UPDATE users SET preferences = jsonb_set(COALESCE(preferences, '{}'::jsonb),
        '{materialAppearance}', $2::jsonb) WHERE id = $1`, [userId, JSON.stringify(next)]);
    }
    return next;
  });
}
