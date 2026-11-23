# ADR-0003 — TLS termination at nginx

- Status: Accepted (user decision D3/D8, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B3](../https-pwa/04-nginx-tls.md)
- Supersedes: none

## Context
- WildFly currently listens on plain HTTP `8080` and is published on the host.
- The PWA needs a trusted HTTPS origin; installing a TLS keystore into WildFly would require changing the server configuration beyond the proxy setting.
- The lab wants a short, recoverable HSTS policy and strict CSP.

## Decision
- Terminate TLS in a new nginx container using the mkcert wildcard certificate from B2.
- Keep WildFly on HTTP behind the proxy; expose only nginx on ports 80/443.
- Use TLS 1.2/1.3, `server_tokens off`, HSTS `max-age=300` without subdomains/preload, and the exact CSP from decision D8.
- Redirect HTTP to HTTPS with a 301.

## Alternatives considered
- **TLS in WildFly**: would need a Java keystore and extra standalone.xml changes; rejected to keep WildFly changes limited to proxy headers.
- **TLS at a separate sidecar on the host**: adds another process and another certificate copy.
- **No HSTS/CSP**: rejected; the demo must show security best practice.

## Consequences
- Positive: one certificate, one place to set headers, no WAR changes.
- Negative: WildFly still sees plain HTTP, so it must be told the original scheme via `X-Forwarded-Proto` (B5).
- Negative: 300-second HSTS still forces HTTPS for five minutes after rollback; documented in troubleshooting.

## References
- https://nginx.org/en/docs/http/configuring_https_servers.html
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security
