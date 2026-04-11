const CACHE = 'pm-v1';
const APP_SHELL = [
  '/9jgCSHsfKTTOHU6D/',
  '/9jgCSHsfKTTOHU6D/index.html',
  '/9jgCSHsfKTTOHU6D/manifest.json',
  '/9jgCSHsfKTTOHU6D/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Navigation: network first, fall back to cached shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/9jgCSHsfKTTOHU6D/index.html'))
    );
    return;
  }

  // Same-origin assets: cache first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // CDN (Firebase, React, fonts): cache first, background update
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});
