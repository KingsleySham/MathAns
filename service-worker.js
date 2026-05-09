const CACHE_NAME = 'mathans-v29';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/data.js', '/manifest.json'];
const BYPASS_PREFIXES = ['/3062470030624770', '/api/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  event.respondWith((async () => {
    if (req.method !== 'GET') {
      try { return await fetch(req); } catch { return Response.error(); }
    }

    if (BYPASS_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
      try { return await fetch(req); } catch { return new Response('Offline', { status: 503 }); }
    }

    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      return await fetch(req);
    } catch {
      const fallback = await caches.match('/index.html');
      return fallback || new Response('Offline', { status: 503 });
    }
  })());
});
