import { mountServerPortal } from './server-portal.mjs';
import { isServerMode, showServerRequired } from './server-mode.mjs';

if (isServerMode()) {
  mountServerPortal(document.querySelector('script[data-portal]').dataset.portal);
} else {
  showServerRequired();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
