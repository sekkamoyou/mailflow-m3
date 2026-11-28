// A grouped notification stays until every message it names is read.
export async function dismissReadNotifications(ids, getMessage, { confirmed = false } = {}) {
  if (ids?.length === 0 || !globalThis.navigator?.serviceWorker?.getRegistration) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.getNotifications) return;
    const notifications = await registration.getNotifications({ tag: 'mailflow-new-mail' });
    const affected = ids && new Set(ids);
    await Promise.all(notifications.map(async notification => {
      const { messageId, messageIds } = notification.data || {};
      const messages = messageId ? [messageId] : messageIds;
      if (!Array.isArray(messages) || !messages.length || !messages.every(id => typeof id === 'string' && id)) return;
      if (affected && !messages.some(id => affected.has(id))) return;
      try {
        const read = await Promise.all(messages.map(async id =>
          (confirmed && affected?.has(id)) || (await getMessage(id))?.is_read === true));
        if (read.every(Boolean)) notification.close();
      } catch { /* Offline, locked or signed out: keep the notification. */ }
    }));
  } catch { /* Notification support or permission must never block reading mail. */ }
}
