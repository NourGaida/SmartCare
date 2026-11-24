import { mountServerPortal } from '../shared/server-portal.mjs';
import { isServerMode, showServerRequired } from '../shared/server-mode.mjs';

if (isServerMode()) {
  mountServerPortal('frontoffice');
} else {
  showServerRequired();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
