// Cache static interface files only. Real measurements and API requests are never cached.
const CACHE = 'smartcare-static-v1';
const STATIC = ['index.html','styles.css','app.js','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest'].map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('smartcare-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Exact allowlist, with no query parameters. Never intercept APIs or external requests.
  if (url.search || !STATIC.includes(url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
