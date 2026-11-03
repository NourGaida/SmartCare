// Exact static allowlist only: no API, WebSocket, session, CSV or measurement caching.
const CACHE = 'smartcare-supervision-static-v2';
const STATIC = ["index.html","app.mjs","adapter.mjs","views.mjs","styles.css","icon.svg","icon-192.png","icon-512.png","manifest.webmanifest","fixtures/administrative.mjs","fixtures/clinical.mjs","../patient/styles.css","../patient/icon.svg","../shared/auth.mjs","../shared/domain.mjs","../shared/ui.mjs","../shared/forms.css"].map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith('smartcare-supervision-static-')) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.search) return;
  const scope = new URL(self.registration.scope);
  const target = url.href === scope.href ? new URL('index.html', scope).href : url.href;
  if (!STATIC.includes(target)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type !== 'opaque') await cache.put(target, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(target);
      if (saved) return saved;
      throw error;
    }
  })());
});
