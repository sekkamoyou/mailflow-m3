import { api } from './api.js';
import { useStore } from '../store/index.js';

// Only the adjacent conversations; consumed when opened so actions never reuse an old snapshot.
const entries = new Map();
const keyFor = (id, folder, unified) => JSON.stringify([id, folder, unified]);
export function prefetchSwipeConversation(id, folder, unified) {
  const key = keyFor(id, folder, unified);
  const existing = entries.get(key);
  if (existing && Date.now() - existing.started < 30_000) return existing;
  const owner = useStore.getState().user?.id;
  const entry = { started: Date.now(), data: null };
  entry.promise = api.getThread(id, folder, unified).then(data => {
    if (useStore.getState().user?.id !== owner) throw new Error('User changed');
    entry.data = data;
    return data;
  }).catch(error => {
    if (entries.get(key) === entry) entries.delete(key);
    throw error;
  });
  entries.set(key, entry);
  while (entries.size > 3) entries.delete(entries.keys().next().value);
  return entry;
}

export function takeSwipeConversation(id, folder, unified) {
  const key = keyFor(id, folder, unified);
  const entry = entries.get(key);
  entries.delete(key);
  return entry && Date.now() - entry.started < 30_000 ? entry : null;
}

useStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) entries.clear();
});
