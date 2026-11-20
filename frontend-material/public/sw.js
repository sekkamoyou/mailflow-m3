// MailFlow Service Worker — handles Web Push and notification clicks.
// Intentionally minimal: no fetch interception, no caching strategy.
// The sole purpose of this SW is push delivery and notification click handling.

self.addEventListener('install', () => {
  // Force this SW to activate immediately, bypassing the waiting phase.
  // Safe here because this SW does no fetch interception or caching — there
  // is no state to hand off from the old version to the new one.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all existing clients so push events reach this SW version.
  event.waitUntil(self.clients.claim());
});

function appImage(value, path) {
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin === self.location.origin && parsed.pathname === path) return `${path}?v=material-2`;
    return value;
  } catch { return `${path}?v=material-2`; }
}

async function notificationIcon(avatar) {
  if (typeof avatar !== 'string') return null;
  let timer;
  try {
    const url = new URL(avatar, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/api/notification-avatar/')) return null;
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(url.href, { credentials: 'omit', cache: 'no-store', signal: controller.signal });
    const valid = response.ok && response.headers.get('content-type')?.split(';')[0] === 'image/png';
    await response.body?.cancel();
    return valid ? url.href : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

const labels = new URL(self.location.href || `${self.location.origin}/sw.js`).searchParams;
const MESSAGE_ACTIONS = [
  { action: 'read', title: labels.get('read') || 'Mark as read' },
  { action: 'archive', title: labels.get('archive') || 'Archive' },
];

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const {
    title       = 'MailFlow M3',
    body        = 'New message',
    badge       = '/badge-96.png?v=material-2',
    avatar,
    url         = '/',
    messageId,            // only for a push about one message: enables the action buttons
    unreadCount,          // intentionally no default — undefined means "don't touch badge"
  } = data;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const promises = [];

        // Update the home screen badge (iOS 17.4+, Android Chrome PWA).
        // Only runs when unreadCount is explicitly provided — a missing value
        // means the backend couldn't determine the count and should not clear it.
        // Uses self.navigator — bare `navigator` is not reliably exposed in iOS
        // Safari service worker scope.
        try {
          if (self.navigator && 'setAppBadge' in self.navigator && unreadCount != null) {
            const p = unreadCount > 0
              ? self.navigator.setAppBadge(unreadCount)
              : self.navigator.clearAppBadge();
            if (p && typeof p.then === 'function') promises.push(p.catch(() => {}));
          }
        } catch { /* A badge failure must not block the notification. */ }

        // iOS/WebKit requires showNotification() to be called for every push event.
        // Skipping it — even when a client is focused — causes WebKit to log a
        // user-visible-notification violation and will eventually revoke push permission.
        // The in-app WebSocket toast still fires independently via the open client.
        promises.push(
          notificationIcon(avatar).then(resolvedIcon => self.registration.showNotification(title, {
            body,
            ...(resolvedIcon ? { icon: resolvedIcon } : {}),
            badge: appImage(badge, '/badge-96.png'),
            data:  { url, messageId },
            ...(messageId ? { actions: MESSAGE_ACTIONS } : {}),
            // Replace any existing MailFlow notification so rapid arrivals
            // don't stack unboundedly in the notification center.
            tag:      'mailflow-new-mail',
            renotify: true,
          }))
        );

        for (const client of clients) {
          try { client.postMessage({ type: 'mailflow_push' }); } catch { /* A tab may close during delivery. */ }
        }
        return Promise.all(promises);
      })
  );
});

// Persist a deep-link target in IndexedDB so the page can consume it on focus or
// launch. This is the reliable channel on iOS: postMessage can be missed on a
// focus-with-reload, and iOS ignores the openWindow() URL on a cold launch — but a
// persisted target survives both. Fully guarded so a storage error never rejects
// the waitUntil. (Only reachable when the app is backgrounded — iOS does not fire
// notificationclick at all for a fully-terminated PWA.)
function storePendingDeepLink(url) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try {
      const open = indexedDB.open('mailflow-nav', 1);
      open.onupgradeneeded = () => { try { open.result.createObjectStore('kv'); } catch { /* Another worker may have created the store. */ } };
      open.onerror = done;
      open.onblocked = done;
      open.onsuccess = () => {
        try {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(url, 'pending_deeplink');
          tx.oncomplete = () => { db.close(); done(); };
          tx.onerror = () => { db.close(); done(); };
          tx.onabort = () => { db.close(); done(); };
        } catch { done(); }
      };
    } catch { done(); }
  });
}

// Open the app, at the deep link when there is one: focus a live client, or open a window.
function openApp(targetUrl) {
  const deepLink = !!targetUrl && targetUrl !== '/';
  return (deepLink ? storePendingDeepLink(targetUrl) : Promise.resolve())
    .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .then((clients) => {
      const existing = clients.find(
        (c) => new URL(c.url).origin === self.location.origin
      );
      if (existing) {
        // Nudge the live client to consume the persisted deep-link immediately
        // (no reload). Harmless if nothing is listening.
        if (deepLink) existing.postMessage({ type: 'mailflow_deeplink' });
        return existing.focus();
      }
      // Cold/killed: openWindow's URL is honored on Chromium and ignored on iOS,
      // but the persisted target above covers iOS on the next app launch.
      return self.clients.openWindow(targetUrl);
    });
}

function apiRequest(method, path, body) {
  return fetch(path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'MailFlow' },
    body: JSON.stringify(body),
  });
}

// Run a notification button without opening the app. Resolves 'done', 'no-archive-folder', or
// 'open' when it could not run here: signed out (401), screen lock (423), offline, or a refusal.
// The app then opens at the message, as a plain tap would.
function runMessageAction(action, messageId) {
  const id = encodeURIComponent(messageId);
  const request = action === 'read'
    ? apiRequest('PATCH', `/api/mail/messages/${id}/read`, { read: true })
    : apiRequest('POST', '/api/mail/messages/bulk-archive', { ids: [messageId] });
  return request
    .then((res) => {
      if (!res.ok) return 'open';
      if (action === 'read') return 'done';
      return res.json().then((result) => {
        if (Array.isArray(result?.archived) && result.archived.includes(messageId)) return 'done';
        if (Array.isArray(result?.noArchiveFolder) && result.noArchiveFolder.length) return 'no-archive-folder';
        return 'open';
      });
    })
    .catch(() => 'open');
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  const messageId = event.notification.data?.messageId;

  if (messageId && (event.action === 'read' || event.action === 'archive')) {
    event.waitUntil(runMessageAction(event.action, messageId).then((outcome) => {
      if (outcome === 'done') return undefined;
      if (outcome === 'no-archive-folder') {
        return self.registration.showNotification(labels.get('noArchiveTitle') || 'Not archived', {
          body: labels.get('noArchiveBody') || 'This account has no Archive folder. Tap to open the message.',
          badge: appImage('/badge-96.png', '/badge-96.png'),
          data: { url: targetUrl },
          tag: 'mailflow-action-failed',
        });
      }
      return openApp(targetUrl);
    }));
    return;
  }

  event.waitUntil(openApp(targetUrl));
});
