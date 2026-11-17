import { mountServerPortal } from '../shared/server-portal.mjs';

// Dedicated patient entry: the patient session always mounts History, never the
// supervision session placeholder. A new entry URL also avoids an old shared bootstrap.
if (location.pathname.startsWith('/smartcare/frontends/')) {
  mountServerPortal('frontoffice');
} else {
  import('./app.js');
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
