// location-worker.js
// Service Worker that keeps location tracking alive in the background
// and shows a persistent notification when the driver is online.

const CACHE_NAME = 'tuktrack-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ── Handle messages from the app ──────────────────────────────────────────────
self.addEventListener('message', async (event) => {
  const { type, payload } = event.data || {};

  if (type === 'GO_ONLINE') {
    // Show persistent notification
    await self.registration.showNotification('🟢 TukTrack — Online', {
      body: 'A partilhar localização em tempo real. Toque para abrir a aplicação.',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'tuktrack-online',          // tag = only one notification at a time
      renotify: false,
      silent: true,
      requireInteraction: true,        // stays until driver goes offline
      data: { url: '/' },
    });
  }

  if (type === 'GO_OFFLINE') {
    // Remove the notification
    const notifications = await self.registration.getNotifications({ tag: 'tuktrack-online' });
    notifications.forEach(n => n.close());
  }

  if (type === 'UPDATE_NOTIFICATION') {
    // Update notification text with latest coords (optional)
    const { lat, lng } = payload || {};
    const notifications = await self.registration.getNotifications({ tag: 'tuktrack-online' });
    if (notifications.length > 0) {
      await self.registration.showNotification('🟢 TukTrack — Online', {
        body: `📍 ${lat?.toFixed(5)}, ${lng?.toFixed(5)} — Toque para abrir`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'tuktrack-online',
        renotify: false,
        silent: true,
        requireInteraction: true,
        data: { url: '/' },
      });
    }
  }
});

// ── Notification tap → open/focus the app ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
