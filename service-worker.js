// service-worker.js

// IMPORTANT: Every time you update data.js, app.js, or index.html,
// you MUST change this version number (e.g., v18 -> v19) to trigger the update.
const CACHE_NAME = 'mathans-v28';

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/manifest.json'
];

const BYPASS_PREFIXES = ['/3062470030624770', '/api/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(cacheNames.map(cache => (cache !== CACHE_NAME ? caches.delete(cache) : Promise.resolve())))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    BYPASS_PREFIXES.some(prefix => url.pathname.startsWith(prefix))
  ) {
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(request).catch(() =>
        caches.match('/index.html').then(fallback => fallback || Response.error())
      );
    })
  );
});
