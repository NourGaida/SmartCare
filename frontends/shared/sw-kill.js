self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('smartcare-')).map(key => caches.delete(key)));
    await self.registration.unregister();
    await self.skipWaiting();
  })());
});
