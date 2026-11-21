# ADR-0012 — HTTPS backend verification contract

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [backend live verification](../https-pwa/backend-live-verification.md), [B6 verification](../https-pwa/07-https-verification.md)
- Supersedes: none

## Context
- Phase B had live evidence for HTTPS assets and headers, but not for the authenticated backend path through nginx.
- The exact contract is already implemented in `AuthResource`, `SecurityFilter`, `SessionResource` and `PatientMeasurementsResource`; guessing routes or payloads would produce false evidence.
- Login failures are rate-limited at five attempts per 15 minutes, so a verification script must not lock the documented dev user.
- Cookie values and CSRF tokens are secrets and must never be written to the repository or console transcript.

## Decision
- Extend `scripts/smoke-https.ps1` with `-WithLogin`, driven only by `SMARTCARE_DEV_EMAIL` and `SMARTCARE_DEV_PASSWORD`.
- Verify `/api/health` rewrite, login response and cookie flags, `GET /api/session`, CSRF negative and positive cases on `POST /api/auth/logout`, logout expiry, and patient-role route behavior for both HTTPS hosts.
- Use temporary cookie jars outside the repository and delete every temporary file in `finally`.
- Use one wrong-password attempt and one unknown-email attempt per host, then a successful login; document the five-attempt/15-minute threshold and the 15-minute TTL.
- Treat the missing staff-only backend role check as a GAP for the login-completion task, not as a Phase B bug fix.
- Keep live results `UNVERIFIED` until the user runs the script and pastes redacted output.

## Alternatives considered
- Hand-written curl commands with cookies pasted into chat: rejected because it risks secret leakage and is not reproducible.
- Reusing production-like credentials in fixtures: rejected; only documented dev seed accounts passed through environment variables are allowed.
- Adding a staff-only backend role check now: rejected because no live bug was proven and application logic changes require explicit approval.
- Marking checks verified from unit tests: rejected; unit tests do not prove nginx rewrite, TLS, cookie or CSRF behavior.

## Consequences
- Positive: one command produces repeatable, host-by-host evidence for the backend path.
- Positive: failed logins stay below the lockout threshold and secrets stay out of git.
- Negative: the script depends on MongoDB and the real WildFly backend being up.
- Negative: the known cross-app role gap remains open until the login-completion task.

## References
- [Backend live verification guide](../https-pwa/backend-live-verification.md)
- [ADR-0004 same-origin API](ADR-0004-same-origin-api.md)
- [ADR-0006 session cookie](ADR-0006-session-cookie.md)
