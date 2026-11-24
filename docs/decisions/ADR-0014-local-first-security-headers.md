# ADR-0014 — Local-first security headers

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [security hygiene audit](../https-pwa/security-hygiene.md), [ADR-0003 TLS termination](ADR-0003-tls-termination.md)
- Supersedes: none

## Context
- The local HTTPS profile uses a mkcert CA and short-lived development hostnames.
- D8 fixed an exact CSP and HSTS `max-age=300` without `includeSubDomains` or `preload` to avoid making a local-only mistake sticky in browsers.
- A production deployment will need a different trust model, longer HSTS and a review of any new inline scripts, external assets or WebSocket destinations.
- The current audit found no tracked certificate/key files or personal paths, but several port-exposure gaps inherited from the legacy lab setup.

## Decision
- Keep the local CSP exactly as specified in D8 and HSTS at `max-age=300`; do not change `nginx-security-headers.conf` in Phase B.
- Record production hardening as a separate issue: use a valid CA, consider longer HSTS only after the production hostname and all subdomains are confirmed HTTPS-ready, and re-review CSP sources before enabling strict transport on a real domain.
- Do not bind WildFly or MongoDB to public interfaces in a production design; the current local port bindings are documented as gaps, not silently changed.
- Keep portal-role segregation as a login-completion gap until a backend staff-only check exists and is covered by smoke tests.

## Alternatives considered
- Enable `includeSubDomains; preload` now: rejected because the local CA and `.local` names are not production-ready and HSTS is difficult to reverse.
- Loosen CSP with `unsafe-inline` to make future UI work easier: rejected; no current need and it would reduce protection.
- Change Docker port bindings during Phase B: rejected because D3 requires legacy behavior to remain untouched until verification and migration are approved.

## Consequences
- Positive: local evidence remains reproducible without risking long-lived browser policy.
- Positive: production requirements are explicit and issue-ready.
- Negative: the lab currently exposes more ports than a hardened deployment should.
- Negative: portal role separation remains a known gap until login completion.

## References
- [Security hygiene audit](../https-pwa/security-hygiene.md)
- [ADR-0003 TLS termination](ADR-0003-tls-termination.md)
- [ADR-0012 HTTPS backend verification](ADR-0012-https-backend-verification.md)
