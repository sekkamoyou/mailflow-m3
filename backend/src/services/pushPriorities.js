export const PUSH_CATEGORIES = ['primary', 'newsletter', 'promotion', 'automated', 'social'];
export const PUSH_URGENCIES = ['very-low', 'low', 'normal', 'high'];

export function validPushPriorities(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([key, urgency]) => PUSH_CATEGORIES.includes(key) && PUSH_URGENCIES.includes(urgency));
}

export function normalizePushPriorities(value) {
  return Object.fromEntries(PUSH_CATEGORIES.map(key => [key,
    PUSH_URGENCIES.includes(value?.[key]) ? value[key] : 'high',
  ]));
}

export function selectPushUrgency(priorities, categories) {
  if (!categories.length) return 'high';
  const settings = normalizePushPriorities(priorities);
  const ranks = categories.map(category => PUSH_URGENCIES.indexOf(settings[category ?? 'primary'] ?? 'high'));
  return PUSH_URGENCIES[Math.max(...ranks)];
}
