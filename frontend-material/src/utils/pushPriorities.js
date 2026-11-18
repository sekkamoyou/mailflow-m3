export const PUSH_CATEGORIES = ['primary', 'newsletter', 'promotion', 'automated', 'social'];
export const PUSH_PRIORITIES = ['high', 'normal', 'low', 'very-low'];

export function normalizePushPriorities(raw) {
  const values = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return Object.fromEntries(PUSH_CATEGORIES.map(category => [category,
    Object.hasOwn(values, category) && PUSH_PRIORITIES.includes(values[category]) ? values[category] : 'high',
  ]));
}
