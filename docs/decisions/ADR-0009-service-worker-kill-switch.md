# ADR-0009 — One-time service worker kill-switch

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [B6](../https-pwa/07-https-verification.md)
- Supersedes: none

## Context
- Chrome can keep showing an old 404 for `/icon.svg`, `/portal.mjs` and `/styles.css` after nginx is fixed because a previous response carried `Cache-Control: public, max-age=3600`.
- A previously installed service worker may also keep an old static cache. The updated workers use new cache names (`smartcare-patient-static-v9`, `smartcare-supervision-static-v8`) and delete older `smartcare-*` caches on `activate`.
- Some browsers may not fetch the new `sw.js` promptly even with `Cache-Control: no-cache`. A temporary kill-switch is needed for those cases only.

## Decision
- Keep `frontends/shared/sw-kill.js` in the repository as a dormant, one-time maintenance worker. It deletes all `smartcare-*` caches and calls `self.registration.unregister()` on install.
- Do **not** point `/sw.js` at the kill-switch in the committed nginx configuration. Both servers continue to alias the real app workers.
- If a browser still shows the broken page after the normal version bump:
  1. Temporarily change both `location = /sw.js` aliases in `docker/nginx-https.conf` to `/usr/share/nginx/html/shared/sw-kill.js`.
  2. Run `docker compose -f docker/compose.https.yml up -d`.
  3. Open `https://app.smartcare.local/` and `https://staff.smartcare.local/` once each.
  4. Revert both aliases to the real `frontoffice/sw.js` and `backoffice/sw.js`, then run `docker compose -f docker/compose.https.yml up -d` again.
- The kill-switch is never left active. It is a tool, not the default worker.

## Alternatives considered
- Permanent kill-switch worker: rejected; would prevent offline support forever.
- Rely only on cache-version bump: insufficient for browsers that do not re-fetch `sw.js`.
- Ask users to clear browser storage only: slow and not reproducible.

## Consequences
- Positive: a reproducible escape hatch exists for stale workers.
- Negative: activating it requires a temporary config edit and two Compose restarts.
- Negative: the kill-switch file must remain excluded from normal SW precache lists.

## References
- [B6 verification](../https-pwa/07-https-verification.md)
- [Kill-switch worker](../../frontends/shared/sw-kill.js)
- [nginx HTTPS config](../../docker/nginx-https.conf)
