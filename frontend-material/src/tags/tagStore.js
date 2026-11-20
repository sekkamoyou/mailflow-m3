// Client-side cache of the tags on messages. Rows ask for their message's tags; lookups made in the
// same tick are batched into one request. `tags_updated` (WebSocket) invalidates and refetches.
import { useEffect } from 'react';
import { create } from 'zustand';
import { api } from '../utils/api.js';

const BATCH_MS = 40;
const MAX_IDS = 200;
const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canTagMessage = id => typeof id === 'string' && MESSAGE_ID.test(id);

export const useTagStore = create(() => ({ byMessage: {}, definitionsRevision: 0 }));

const wanted = new Map();
const pending = new Map();
let timer = null;

async function flush() {
  timer = null;
  const queued = [...wanted];
  wanted.clear();
  for (let i = 0; i < queued.length; i += MAX_IDS) {
    const chunk = queued.slice(i, i + MAX_IDS).filter(([id, token]) => pending.get(id) === token);
    if (!chunk.length) continue;
    try {
      const found = await api.tagsForMessages(chunk.map(([id]) => id));
      const current = chunk.filter(([id, token]) => pending.get(id) === token);
      const patch = Object.fromEntries(current.map(([id]) => [id, found[id] || []]));
      if (current.length) useTagStore.setState(s => ({ byMessage: { ...s.byMessage, ...patch } }));
    } catch {
      // A later request can retry.
    } finally {
      for (const [id, token] of chunk) {
        if (pending.get(id) === token) pending.delete(id);
      }
    }
  }
}

export function requestTags(id) {
  if (useTagStore.getState().byMessage[id] !== undefined || pending.has(id)) return;
  const token = Symbol();
  pending.set(id, token);
  wanted.set(id, token);
  if (!timer) timer = setTimeout(flush, BATCH_MS);
}

// Refetch mounted or cached rows. A result from an earlier request must not replace that refresh.
export function invalidateTags(ids) {
  const byMessage = { ...useTagStore.getState().byMessage };
  const held = ids.filter(id => byMessage[id] !== undefined || pending.has(id));
  if (!held.length) return;
  for (const id of held) {
    delete byMessage[id];
    pending.delete(id);
  }
  useTagStore.setState({ byMessage });
  for (const id of held) requestTags(id);
}

export function refreshAllTags() {
  invalidateTags([...new Set([...Object.keys(useTagStore.getState().byMessage), ...pending.keys()])]);
}

export function clearTagCache() {
  clearTimeout(timer);
  timer = null;
  wanted.clear();
  pending.clear();
  useTagStore.setState({ byMessage: {}, definitionsRevision: 0 });
}

// The tags on one message, fetched (batched) on first use and kept fresh by invalidateTags.
export function useMessageTags(messageId) {
  const tags = useTagStore((s) => s.byMessage[messageId]);
  useEffect(() => { if (messageId) requestTags(messageId); }, [messageId]);
  return tags || [];
}

// The list of tag definitions is fetched by several screens at once (the settings and the picker).
// After a change, call bumpTagDefinitions(); every screen that depends on useTagDefinitionsRevision()
// then reloads, so none shows a stale list.
export const bumpTagDefinitions = () => useTagStore.setState((s) => ({ definitionsRevision: s.definitionsRevision + 1 }));
export const useTagDefinitionsRevision = () => useTagStore((s) => s.definitionsRevision);
