# ADR-0006 — Session cookie: Strict + profile-driven Secure

- Status: Accepted (user decision D4, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B4](../https-pwa/05-session-cookie-security.md)
- Supersedes: none

## Context
- `AuthResource.buildCookie()` already sets `HttpOnly` and `SameSite=STRICT`; `Secure` came from `SessionSettings` and defaulted to false.
- The new PWA is same-origin (`/api/`), while the legacy demo is plain HTTP on 8081/8082.
- Hard-coding `Secure=true` would break the legacy demo; deriving it from `X-Forwarded-Proto` would trust a client-supplied header.

## Decision
- Keep `SameSite=STRICT`, `HttpOnly=true`, `Path=/`, name `SMARTCARE_SESSION`, 30-minute idle / 8-hour absolute lifetimes.
- Make `Secure` configurable through `smartcare.session.secure` (JVM property) or `SMARTCARE_SESSION_SECURE` (env), default `false`; property wins.
- Use `secure=true` only in the HTTPS WildFly profile (wired in B5). Legacy HTTP containers leave it unset.
- Add three IAM tests for unset/false/true.

## Alternatives considered
- **Always `Secure=true`**: breaks `http://192.168.1.4:8081` login; rejected until cutover.
- **`SameSite=Lax` or `None`**: unnecessary for same-origin calls; `None` would also require `Secure` and break legacy.
- **Derive from `X-Forwarded-Proto`**: spoofable unless every proxy path is trusted; rejected for explicit configuration.
- **Separate cookie per app**: no need, host-only cookies already isolate origins.

## Consequences
- Positive: one codebase supports both profiles, tests prove both values, security posture is explicit.
- Positive: `Strict` remains the strongest practical value for this app.
- Negative: operators must set the env/property on the HTTPS WildFly; missing it silently yields a non-Secure cookie (B6 header check catches this).
- Negative: setting it on legacy HTTP causes immediate logout; documented.

## References
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#secure
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value
