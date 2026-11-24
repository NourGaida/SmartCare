import { mountServerPortal } from './server-portal.mjs';

mountServerPortal(document.querySelector('script[data-portal]').dataset.portal);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
