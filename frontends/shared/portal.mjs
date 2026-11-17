import { mountServerPortal } from './server-portal.mjs';

// Legacy shared entry remains available for supervision and previously opened pages.
const portal = document.querySelector('script[data-portal]').dataset.portal;
if (location.pathname.startsWith('/smartcare/frontends/')) {
  mountServerPortal(portal);
} else if (portal === 'frontoffice') {
  import('../frontoffice/app.js');
} else {
  import('../backoffice/app.mjs');
}
