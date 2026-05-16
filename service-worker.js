const CACHE_NAME = 'mathans-v30';
const PRECACHE_ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/data.js', '/manifest.json'];
const BYPASS_PREFIXES = ['/3062470030624770', '/api/'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (BYPASS_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return;

  // Network-first with cache fallback: always try the network so deploys
  // appear on the next reload. If network fails (offline), serve from the
  // cache that was populated during precache + previous successful fetches.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const indexFallback = await caches.match('/index.html');
        if (indexFallback) return indexFallback;
      }
      return new Response('Offline', { status: 503 });
    }
  })());
});
