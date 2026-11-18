import { useEffect } from 'react';
import { api } from '../utils/api.js';
import { useStore } from '../store/index.js';

export function useMessageMetadata(messages, onUpdate) {
  const ids = messages.filter(m => m?.id && !Array.isArray(m.folder_paths)).slice(0, 500).map(m => m.id).join(',');
  const userId = useStore(state => state.user?.id);
  useEffect(() => {
    if (!ids) return undefined;
    let cancelled = false;
    api.getMessageMetadata(ids.split(',')).then(data => {
      if (cancelled || useStore.getState().user?.id !== userId) return;
      for (const metadata of data.messages || []) {
        const updates = { folder_paths: metadata.folder_paths };
        if (metadata.snippet) updates.snippet = metadata.snippet;
        (onUpdate || useStore.getState().updateMessage)(metadata.id, updates);
      }
    }).catch(err => console.warn('Message metadata unavailable:', err.message));
    return () => { cancelled = true; };
  }, [ids, userId, onUpdate]);
}
