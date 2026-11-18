import { applyTheme, normalizeColorPalette, normalizeSeedColor } from '../themes.js';
import { api } from '../utils/api.js';

export const DEFAULT_APP_NAME = 'MailFlow M3';
const DEFAULT = { theme: 'system', colorPalette: 'purple', customColor: '#6750a4', displayName: '' };
const cacheKey = (owner, device) => `mailflow_material_appearance:${owner}:${device}`;
export function appearanceDevice(navigator = globalThis.navigator) {
  // Device identity stays stable when a desktop window is resized.
  return navigator?.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator?.userAgent || '')
    || (/Macintosh/i.test(navigator?.userAgent || '') && navigator?.maxTouchPoints > 1) ? 'mobile' : 'desktop';
}
const profileFor = (config, device) => ({ ...DEFAULT, ...config?.[config.mode === 'separate' ? device : 'shared'] });
function legacyProfile() {
  return { ...DEFAULT, theme: ['system', 'light', 'dark'].includes(localStorage.getItem('mailflow_material_theme')) ? localStorage.getItem('mailflow_material_theme') : 'system',
    colorPalette: normalizeColorPalette(localStorage.getItem('mailflow_material_palette')),
    customColor: normalizeSeedColor(localStorage.getItem('mailflow_material_custom_color')) || DEFAULT.customColor };
}
function overlay(config, operation, device) {
  const next = structuredClone(config);
  if (operation.mode === 'separate' && next.mode !== 'separate') {
    next.mobile ||= { ...next.shared }; next.desktop ||= { ...next.shared };
  } else if (operation.mode === 'shared' && next.mode === 'separate') next.shared = { ...next[device] };
  if (operation.mode) next.mode = operation.mode;
  if (operation.changes) next[operation.target] = { ...next.shared, ...next[operation.target], ...operation.changes };
  return next;
}

export function createAppearanceSlice(set, get) {
  const device = appearanceDevice();
  let owner = null, generation = 0, readSequence = 0, timer, running = false, ready = false;
  let pending = [], config = { mode: 'shared', shared: legacyProfile(), revision: 0 };
  const persist = () => {
    if (owner) localStorage.setItem(cacheKey(owner, device), JSON.stringify({ config, pending }));
  };
  const apply = () => {
    const profile = profileFor(config, device);
    localStorage.setItem('mailflow_material_theme', profile.theme);
    localStorage.setItem('mailflow_material_palette', profile.colorPalette);
    localStorage.setItem('mailflow_material_custom_color', profile.customColor);
    set({ theme: profile.theme, colorPalette: profile.colorPalette, customColor: profile.customColor,
      personalDisplayName: profile.displayName, appDisplayName: profile.displayName || get().serverDisplayName,
      appearanceMode: config.mode });
    if (typeof document !== 'undefined') applyTheme(profile.theme, profile.colorPalette);
    persist();
  };
  const flush = async () => {
    clearTimeout(timer);
    if (!owner || !ready || running || !pending.length || get().isLocked) return;
    const scope = generation, userId = owner;
    running = true;
    set({ appearanceStatus: 'saving' });
    try {
      while (scope === generation && pending.length) {
        const operation = pending[0];
        const result = await api.savePreferences({ materialAppearance: { ...operation, device, ownerId: userId } }, { keepalive: true });
        if (scope !== generation) return;
        if (!result.materialAppearance) throw new Error('Appearance response missing');
        pending.shift();
        config = pending.reduce((next, op) => overlay(next, op, device), result.materialAppearance);
        apply();
      }
      if (scope === generation) set({ appearanceStatus: 'saved' });
    } catch {
      if (scope === generation) { persist(); set({ appearanceStatus: 'error' }); }
    } finally {
      if (scope === generation) running = false;
    }
  };
  const enqueue = operation => {
    if (!owner) return;
    // Never mutate the operation already sent; only combine unsent color-picker edits.
    const last = pending.at(-1);
    if (operation.changes && last?.changes && last.target === operation.target && (!running || pending.length > 1)) {
      last.changes = { ...last.changes, ...operation.changes };
    } else pending.push(operation);
    config = overlay(config, operation, device);
    apply();
    set({ appearanceStatus: 'pending' });
    clearTimeout(timer); timer = setTimeout(flush, 300);
  };
  const receive = async (server, scope, responseOwner) => {
    if (scope !== generation) return false;
    if (responseOwner && responseOwner !== owner) {
      set({ appearanceStatus: 'error' });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('mailflow:session_expired'));
      return false;
    }
    if (running) return true;
    if (!server) {
      if (!pending.some(op => op.initialize)) pending.unshift({ initialize: profileFor(config, device) });
    } else {
      pending = pending.filter(op => !op.initialize);
      if ((server.revision || 0) >= (config.revision || 0)) config = pending.reduce((next, op) => overlay(next, op, device), server);
    }
    ready = true; apply();
    if (pending.length) await flush();
    else set({ appearanceStatus: 'saved' });
    return true;
  };
  return {
    serverDisplayName: DEFAULT_APP_NAME, appDisplayName: DEFAULT_APP_NAME, personalDisplayName: '',
    appearanceDevice: device, appearanceMode: 'shared', appearanceStatus: 'loading',
    theme: config.shared.theme, colorPalette: config.shared.colorPalette, customColor: config.shared.customColor,
    setAppDisplayName: name => {
      const serverDisplayName = typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_APP_NAME;
      set({ serverDisplayName, appDisplayName: get().personalDisplayName || serverDisplayName });
    },
    switchAppearanceUser: userId => {
      clearTimeout(timer); generation++; readSequence++; running = false; ready = false; owner = userId || null;
      let cached;
      try { cached = JSON.parse(localStorage.getItem(cacheKey(owner, device)) || 'null'); } catch { /* use defaults */ }
      const legacyOwner = localStorage.getItem('mailflow_material_appearance_owner');
      config = cached?.config || { mode: 'shared', shared: owner && !legacyOwner ? legacyProfile() : { ...DEFAULT }, revision: 0 };
      pending = owner && Array.isArray(cached?.pending) ? cached.pending : [];
      if (owner) localStorage.setItem('mailflow_material_appearance_owner', owner);
      set({ appearanceStatus: owner ? 'loading' : 'saved' });
      apply();
    },
    hydrateAppearance: (server, responseOwner) => receive(server, generation, responseOwner),
    refreshAppearance: async () => {
      if (!owner || get().isLocked) return;
      const scope = generation, sequence = ++readSequence;
      try {
        const prefs = await api.getPreferences();
        if (scope === generation && sequence === readSequence) await receive(prefs.materialAppearance, scope, prefs.materialAppearanceOwnerId);
      } catch { if (scope === generation && sequence === readSequence) set({ appearanceStatus: 'error' }); }
    },
    retryAppearance: async () => { if (ready && pending.length) await flush(); else await get().refreshAppearance(); },
    flushAppearance: flush,
    setAppearanceMode: mode => { if (['shared', 'separate'].includes(mode) && config.mode !== mode) enqueue({ mode }); },
    setPersonalDisplayName: displayName => enqueue({ target: config.mode === 'shared' ? 'shared' : device, changes: { displayName: displayName.trim() } }),
    setTheme: value => {
      const theme = ['system', 'light', 'dark'].includes(value) ? value : 'system';
      if (owner) enqueue({ target: config.mode === 'shared' ? 'shared' : device, changes: { theme } });
      else { config.shared.theme = theme; apply(); }
    },
    setColorPalette: value => {
      const colorPalette = normalizeColorPalette(value);
      const changes = { colorPalette, ...(colorPalette.startsWith('#') ? { customColor: colorPalette } : {}) };
      if (owner) enqueue({ target: config.mode === 'shared' ? 'shared' : device, changes });
      else { Object.assign(config.shared, changes); apply(); }
    },
  };
}
