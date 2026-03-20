// service-worker.js

// IMPORTANT: Every time you update data.js, app.js, or index.html, 
// you MUST change this version number (e.g., v18 -> v19) to trigger the update.
const CACHE_NAME = 'mathans-v19'; 

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/manifest.json'
];

// 1. Install event: Cache files and force the new service worker to install instantly
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  // This forces the waiting service worker to become the active one immediately
  self.skipWaiting(); 
});

// 2. Activate event: Clean up old caches and take control of the page
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // This tells the new service worker to take control of the current page immediately
  self.clients.claim();
});

// 3. Fetch event: Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(response => {
      return response || fetch(event.request);
    })
  );
});
