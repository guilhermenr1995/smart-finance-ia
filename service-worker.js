const CACHE_NAME = 'smart-finance-shell-v1';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './runtime-config.js',
  './src/styles.css',
  './src/app.js',
  './src/config/app-config.js',
  './src/constants/categories.js',
  './src/state/app-state.js',
  './src/services/auth-service.js',
  './src/services/ai-categorization-service.js',
  './src/services/csv-import-service.js',
  './src/services/firebase-service.js',
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
  './assets/icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
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

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
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
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, networkResponse.clone());
  return networkResponse;
}
