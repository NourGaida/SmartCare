import { mountServerPortal } from './server-portal.mjs';
import { isServerMode } from './server-mode.mjs';

// Legacy shared entry remains available for supervision and previously opened pages.
const portal = document.querySelector('script[data-portal]').dataset.portal;
if (isServerMode()) {
  mountServerPortal(portal);
} else if (portal === 'frontoffice') {
  import('../frontoffice/app.js');
} else {
  import('../backoffice/app.mjs');
}
