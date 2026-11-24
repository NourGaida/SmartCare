import { mountServerPortal } from '../shared/server-portal.mjs';

mountServerPortal('frontoffice');

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
