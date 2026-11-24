# Glossary

| Term | Meaning in SmartCare |
| --- | --- |
| HTTPS | HTTP over TLS: the browser verifies the server's certificate before sending data. |
| TLS | Encryption protocol that replaces the old name SSL. HTTPS uses TLS. |
| CA | Certificate Authority: the authority that signs certificates; the phone trusts the CA, then trusts certificates it signed. |
| mkcert | Local tool that creates a private CA and certificates for names like `app.smartcare.local`. |
| rootCA.pem | The public CA certificate that must be installed on the phone. `rootCA-key.pem` is the private key and must never leave the PC. |
| Reverse proxy | A reception desk (nginx) that accepts public requests and forwards them to an internal server (WildFly). |
| PWA | Progressive Web App: a website that can be installed on the home screen and run in its own window. |
| Manifest | JSON file (`manifest.webmanifest`) that tells the browser the app name, colours, icons and start URL. |
| Service worker | A script the browser runs in the background to control caching and offline behaviour. |
| App shell | The minimal HTML/CSS/JS needed to render the interface without network. |
| CSRF | Cross-Site Request Forgery. SmartCare requires `X-CSRF-Token` on every non-safe request. |
| SameSite | Cookie attribute controlling whether a cookie is sent on cross-site navigation. `Lax` is planned; current code uses `Strict`. |
| HttpOnly | Cookie attribute that prevents JavaScript from reading the cookie. |
| Secure | Cookie attribute that makes the browser send the cookie only over HTTPS. |
| HSTS | `Strict-Transport-Security` header: tells browsers to use HTTPS for a period. |
| X-Forwarded-Proto | Header set by nginx telling WildFly that the original client used HTTPS. |
| proxy-address-forwarding | Undertow setting that makes WildFly trust `X-Forwarded-*` headers. |
| Host-only cookie | Cookie without a `Domain` attribute; sent only to the exact host that set it. |
| Same-origin | Same scheme, host and port. Frontends call `/api/...` on their own host to avoid CORS. |
| CORS | Browser rules for cross-origin fetch. Not needed with same-origin `/api/`. |
| mDNS | Multicast DNS used by `.local` names; unreliable on Android, hence the dnsmasq option. |
| ADR | Architecture Decision Record: short note explaining why a choice was made. |
