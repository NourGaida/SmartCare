import { mountServerPortal } from '../shared/server-portal.mjs';
import { isServerMode } from '../shared/server-mode.mjs';

// Dedicated patient entry: the patient session always mounts History, never the
// supervision session placeholder. A new entry URL also avoids an old shared bootstrap.
if (isServerMode()) {
  mountServerPortal('frontoffice');
} else {
  import('./app.js');
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
