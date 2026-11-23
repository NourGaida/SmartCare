# ADR-0008 — Single server-mode predicate for both portals

- Status: Accepted (user decision D2, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B6](../https-pwa/07-https-verification.md)
- Supersedes: none

## Context
- The supervised app is served from two different URL shapes:
  - legacy WildFly path: `/smartcare/frontends/frontoffice/` and `/smartcare/frontends/backoffice/`;
  - HTTPS root-hosted apps: `https://app.smartcare.local/` and `https://staff.smartcare.local/`.
- Each portal previously duplicated the legacy path check with `location.pathname.startsWith('/smartcare/frontends/')`.
- D2 requires one `isServerMode()` function returning true for both shapes, with no new silent fallback and explicit tests for both modes.

## Decision
- Add `frontends/shared/server-mode.mjs` exporting `isServerMode(location = globalThis.location)`.
- Return true when either:
  - `pathname` starts with `/smartcare/frontends/`; or
  - `hostname` is `smartcare.local` or a subdomain ending in `.smartcare.local`.
- Use that single helper in `frontends/shared/portal.mjs` and `frontends/frontoffice/portal.mjs`.
- Add `frontends/tests/server-mode.test.mjs` covering legacy paths, both root hostnames, non-matching origins, and helper wiring in both portals.
- Add the helper to both service-worker precache lists so offline root-hosted apps can still boot.

## Alternatives considered
- Keep duplicated `pathname.startsWith` checks: rejected; D2 asks for one function.
- Assume any root path is server mode: rejected; would silently change demo/localhost behaviour.
- Use `window.location.href.includes('smartcare')`: rejected; too broad and would match unrelated hosts.

## Consequences
- Positive: one tested predicate describes both supported URL shapes.
- Positive: legacy 8081/8082 behaviour is unchanged because the path condition still matches first.
- Negative: new `*.smartcare.local` subdomains automatically use server mode; this is intentional.
- Negative: helper must remain in both SW precache manifests when entries change.

## References
- [B6 verification](../https-pwa/07-https-verification.md)
- [Frontend tests](../../frontends/tests/server-mode.test.mjs)
