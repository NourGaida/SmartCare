# HTTPS/PWA step index

| Step | Document | Status |
| --- | --- | --- |
| A | [00-overview.md](00-overview.md), [01-audit.md](01-audit.md) | Complete |
| B1 | [02-hostnames.md](02-hostnames.md) | Script written; verification UNVERIFIED (needs admin) |
| B2 | [03-local-certificates.md](03-local-certificates.md) | Script/doc written; certificate generation UNVERIFIED (needs UAC) |
| B3 | [04-nginx-tls.md](04-nginx-tls.md) | Config/compose/self-hosted fonts written; static checks pass, live HTTPS UNVERIFIED |
| B4 | [05-session-cookie-security.md](05-session-cookie-security.md) | Code + 14 IAM tests pass; live Set-Cookie UNVERIFIED until B6 |
| B5 | [06-wildfly-proxy.md](06-wildfly-proxy.md) | Image + idempotent CLI verified on test ports; real WildFly cutover deferred to Phase C |
| B6 | [07-https-verification.md](07-https-verification.md) | Static/tests pass; live HTTPS/Lighthouse UNVERIFIED pending user B1/B2 |
| C | 10-registration-install-ux.md, 12-pwa-verification.md | Pending |
| D | 13-phone-access.md | Pending |
| Troubleshooting | [14-troubleshooting.md](14-troubleshooting.md) | Live |
| Screenshots | [screenshots-todo.md](screenshots-todo.md) | Live |

Every step document follows the same 12 sections: Goal, Plain-language explanation, Why it is needed here, Prerequisites, Procedure, Files created or modified, Verification, Troubleshooting, Security notes, Rollback, Decisions and alternatives, References.
