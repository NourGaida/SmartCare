// Exact static allowlist only: no API, WebSocket, session, CSV or measurement caching.
const CACHE = 'smartcare-supervision-static-v9';
const STATIC = [
  'index.html', 'styles.css', '../backoffice/server-care.mjs',
  '../backoffice/simulation-view.mjs', '../backoffice/views.mjs',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest',
  '../frontoffice/styles.css', '../frontoffice/icon.svg', '../frontoffice/measurements-adapter.mjs',
  '../frontoffice/fonts/dm-sans-latin-v17.woff2', '../frontoffice/fonts/dm-sans-latin-ext-v17.woff2',
  '../frontoffice/fonts/manrope-latin-v23.woff2', '../frontoffice/fonts/manrope-latin-ext-v23.woff2',
  '../shared/portal.mjs', '../shared/server-mode.mjs',
  '../shared/server-portal.mjs', '../shared/server-auth.mjs', '../shared/care-api.mjs',
  '../shared/connected-views.mjs', '../shared/connectivity.mjs', '../shared/domain.mjs',
  '../shared/poll-care.mjs', '../shared/scenario-view.mjs',
  '../shared/ui.mjs', '../shared/forms.css'
].map(file => new URL(file, self.registration.scope).href);

async function precacheStatic() {
  const cache = await caches.open(CACHE);
  await Promise.all(STATIC.map(async target => {
    try {
      const response = await fetch(target, { cache: 'no-store' });
      if (response.status === 200 && !response.redirected) await cache.put(target, response.clone());
    } catch { }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheStatic().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => (key.startsWith('smartcare-supervision-static-') || key.startsWith('smartcare-static-') || key.startsWith('smartcare-kill-')) && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.search) return;
  const scope = new URL(self.registration.scope);
  const rootRequest = url.href === scope.href && (!event.request.mode || event.request.mode === 'navigate');
  const target = rootRequest ? new URL('index.html', scope).href : url.href;
  if (!STATIC.includes(target)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.status === 200 && !response.redirected) await cache.put(target, response.clone());
      else await cache.delete(target);
      return response;
    } catch (error) {
      const saved = await cache.match(target);
      if (saved) return saved;
      throw error;
    }
  })());
});
