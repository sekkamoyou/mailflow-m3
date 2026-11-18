import { GTD_COLORS, GTD_CHIP_BG } from '../../utils/gtd.js';

const STATE_ORDER = ['todo', 'watch', 'delegated', 'reference', 'someday'];
const WAITING_STATES = new Set(['watch', 'delegated']);
const STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldShowInboxGtdMetadata({ selectedFolder, searchQuery, activeGtdTab }) {
  return Boolean(searchQuery?.trim()) || (selectedFolder === 'INBOX' && !activeGtdTab);
}

function wholeDays(date, now) {
  const timestamp = new Date(date).getTime();
  if (!date || !Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / DAY_MS));
}

export function buildInboxGtdIndicators(metadata, t, now = Date.now()) {
  if (!Array.isArray(metadata?.states)) return [];
  const states = new Set(metadata.states.filter(state => STATE_ORDER.includes(state)));
  return STATE_ORDER.filter(state => states.has(state)).map(state => {
    const waiting = WAITING_STATES.has(state);
    const hasStateDate = Object.hasOwn(metadata.dates || {}, state);
    const stateDate = hasStateDate ? metadata.dates[state] : metadata.date;
    const days = waiting ? wholeDays(stateDate, now) : null;
    const stale = waiting && days != null && days > STALE_DAYS;
    return {
      state,
      label: waiting && days != null ? `⏱ ${days}d` : t(`gtd.state.${state}`),
      title: waiting && days != null
        ? t('gtd.oldestLabeledAge', { state: t(`gtd.state.${state}`), count: days })
        : t(`gtd.state.${state}`),
      stale,
      color: stale ? 'var(--md-sys-color-on-error-container)' : state === 'reference' ? 'var(--md-sys-color-on-primary-container)' : GTD_COLORS[state],
      background: stale ? 'var(--md-sys-color-error-container)' : GTD_CHIP_BG[state],
    };
  });
}
