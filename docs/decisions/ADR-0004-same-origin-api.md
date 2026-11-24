# ADR-0004 — Same-origin `/api/` with nginx rewrite

- Status: Accepted (user decision D1, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B3](../https-pwa/04-nginx-tls.md), [B6](../https-pwa/07-https-verification.md)
- Supersedes: none

## Context
- Frontend modules resolve their API base with `new URL('../../api/', import.meta.url)`, which yields same-origin `/api/`.
- The deployed WAR has context root `/smartcare` and REST application path `/api`, so the real endpoint is `/smartcare/api/...`.
- `SMARTCARE_SESSION` is host-only with `SameSite=Strict`; a separate API origin would require CORS and cookie changes.

## Decision
- Keep the WildFly context root unchanged.
- In both HTTPS server blocks, route `/api/` with `proxy_pass http://host.docker.internal:8080/smartcare/api/;`.
- Use `location ^~ /api/` so static regex locations cannot intercept API calls.
- Forward `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Forwarded-Host`.
- Document `api.smartcare.local` as an optional alias only; the apps never call it.

## Alternatives considered
- **Change WAR context root to `/`**: rejected by D1 to avoid redeploy risk and broken legacy 8081/8082 demo.
- **Cross-origin `https://api.smartcare.local`**: would need CORS, `SameSite=None`, and a host-only cookie would not be sent; rejected.
- **Add `/api` alias inside WildFly**: more application changes, no benefit.

## Consequences
- Positive: no CORS/preflight, no cookie scope change, legacy API URL still works on 8081/8082.
- Negative: `/smartcare/api/...` must be validated with curl in B6; a wrong `proxy_pass` URI part would double the prefix.
- Negative: any future API path must be added under this location, not as a static route.

## References
- https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
