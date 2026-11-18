// Only close a notification that names one message. A batch may still contain unread mail.
export async function dismissReadNotifications(ids, getMessage) {
  if (ids?.length === 0 || !globalThis.navigator?.serviceWorker?.getRegistration) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.getNotifications) return;
    const notifications = await registration.getNotifications({ tag: 'mailflow-new-mail' });
    await Promise.all(notifications.map(async notification => {
      const id = notification.data?.messageId;
      if (typeof id !== 'string' || !id || (ids && !ids.includes(id))) return;
      try {
        const message = await getMessage(id);
        if (message?.is_read === true) notification.close();
      } catch { /* Offline, locked or signed out: keep the notification. */ }
    }));
  } catch { /* Notification support or permission must never block reading mail. */ }
}
