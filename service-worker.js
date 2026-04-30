const CACHE_NAME = 'smart-finance-shell-v17';
const NETWORK_FIRST_DESTINATIONS = new Set(['document', 'script', 'style', 'manifest']);

const APP_SHELL_FILES = [
  './',
  './index.html',
  './admin.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/admin.js',
  './src/config/app-config.js',
  './src/application/flows/auth-flow.js',
  './src/application/flows/dashboard-flow.js',
  './src/application/flows/data-sync-flow.js',
  './src/application/flows/transaction-flow.js',
  './src/application/flows/ai-flow.js',
  './src/constants/categories.js',
  './src/state/app-state.js',
  './src/services/auth-service.js',
  './src/services/ai-categorization-service.js',
  './src/services/ai-consultant-service.js',
  './src/services/csv-import-service.js',
  './src/services/firebase-service.js',
  './src/services/push-notification-service.js',
  './src/services/pwa-service.js',
  './src/services/transaction-repository.js',
  './src/ui/auth-view.js',
  './src/ui/dashboard-view.js',
  './src/ui/overlay-view.js',
  './src/utils/csv-utils.js',
  './src/utils/date-utils.js',
  './src/utils/format-utils.js',
  './src/utils/transaction-utils.js',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './assets/icons/notification-badge.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (shouldUseNetworkFirst(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification?.close();
  const targetUrl = './index.html';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        for (const client of clientsList) {
          if ('focus' in client) {
            return client.focus();
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return null;
      })
  );
});

function shouldUseNetworkFirst(request) {
  if (request.mode === 'navigate') {
    return true;
  }

  const destination = String(request.destination || '').toLowerCase();
  if (NETWORK_FIRST_DESTINATIONS.has(destination)) {
    return true;
  }

  const requestPath = new URL(request.url).pathname;
  return (
    requestPath.endsWith('.js') ||
    requestPath.endsWith('.css') ||
    requestPath.endsWith('.html') ||
    requestPath.endsWith('.webmanifest')
  );
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    await cacheIfValid(request, networkResponse);
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match('./index.html');
  }
}

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  await cacheIfValid(request, networkResponse);
  return networkResponse;
}

async function cacheIfValid(request, response) {
  if (!response || response.status !== 200) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}
