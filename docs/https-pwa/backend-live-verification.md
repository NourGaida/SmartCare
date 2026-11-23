# Backend live verification through HTTPS

## Goal
- Verify that the real backend API is reachable through nginx on both HTTPS hosts, that the session cookie is safe, and that CSRF/logout/session behavior matches the code.
- Keep all evidence outside the repository except redacted summaries; never commit cookies, tokens, passwords, certificates or personal paths.

## Status
| Check | Status |
| --- | --- |
| Static route/CSRF/cookie contract read from code | PASS |
| PowerShell syntax parse | PASS |
| Default live asset smoke (`pass=61 fail=0`) | PASS |
| Frontend static suite (`81/81`) | PASS |
| Live backend checks (`-WithLogin`) | UNVERIFIED — run by user |
| WildFly container recreation | UNVERIFIED — Task 3 |

## Contract read from code
- `POST /api/auth/login` is public and accepts exactly `email` and `password`.
- `GET /api/health` is public and returns `{"status":"ok"}`.
- `GET /api/session` returns 401 `unauthorized` without a valid session and 200 with `userId`, `role`, `csrfToken`, `expiresAt`.
- `POST /api/auth/logout` is protected; non-GET/HEAD/OPTIONS requests require `X-CSRF-Token`.
- Missing/invalid CSRF returns 403 `csrf_invalid`; successful logout returns 204 and an expired session cookie.
- `GET /api/me/measurements` accepts `PATIENT` and rejects other roles with 403 `forbidden`.
- Login failures use 401 `invalid_credentials` for both wrong password and unknown email; the sixth failure in 15 minutes returns 429 `too_many_attempts`.
- Cookie flags from `AuthResource.buildCookie`: `Path=/`, `HttpOnly`, `Secure` when `SMARTCARE_SESSION_SECURE=true`, `SameSite=Strict`, no `Domain`.

## User-run procedure (Administrator: no)
1. Open a normal PowerShell in the repository root. Set the documented dev seed credentials in the process environment only:

   ```powershell
   $env:SMARTCARE_DEV_EMAIL='patient@smartcare.local'
   $env:SMARTCARE_DEV_PASSWORD='<DEV_PASSWORD_FROM_PASSWORD_MANAGER>'
   ```

2. Run the authenticated smoke pass and keep the transcript outside the repository:

   ```powershell
   PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-https.ps1 -Repo '<REPO>' -WithLogin | Tee-Object -FilePath "$env:TEMP\smartcare-withlogin.txt"
   ```

3. Paste the redacted output into the issue/chat. Do not commit `$env:TEMP\smartcare-withlogin.txt`.

## Expected output shape
- For each host, the log starts with `=== <host> backend (<ROLE>) ===`.
- `api health rewrite`: 200, `backend_body=ok`, `rewrite=/api/ -> /smartcare/api/`.
- `negative login`: 401 for a wrong password and for an unknown email, identical `error` and `message`.
- `NOTE ... lockout threshold=5 failures in 15 minutes (6th returns 429); this check uses 2 failures...`.
- `login`: 200 with `csrf_present=True`.
- `cookie flags`: `secure=True httponly=True samesite_strict=True path_root=True domain_absent=True`.
- `who am i`: 200 and the role expected from the supplied dev email.
- `patient route`: 200 or 503 for `PATIENT`; 403 `forbidden` for `PROFESSIONAL`/`ADMIN`.
- `GAP ... no backend staff-only route exists; /api/session returns any authenticated role and portal segregation is client-side only`.
- `CSRF without header`: 403 `csrf_invalid`; `session survives missing CSRF`: 200.
- `CSRF with header`: 204 and `cookie_expired=True`; `session invalid after CSRF logout`: 401.
- `logout`: 204 and `cookie_expired=True`; `who am i after logout`: 401.
- Final line with all checks passing: `SUMMARY pass=87 fail=0 gap=2`.

## Lockout safety
- The script uses two failed logins per host and then a successful login, which resets the email and IP counters.
- Only run it when there have been fewer than three recent failures for the same email/IP; otherwise wait 15 minutes.
- If a 429 still appears, the TTL clears it after 15 minutes. To clear early, run:

  ```powershell
  mongosh "mongodb://localhost:27017/smartcare" --quiet --eval 'db.login_attempts.deleteMany({})'
  ```

## Known gap (do not fix here)
- There is no staff-only backend route that rejects a patient session. `SecurityFilter` authenticates any valid session; `PatientMeasurementsResource` only enforces patient-only access on one patient route.
- This is recorded as an issue-ready gap for the login-completion task. No application logic is changed in Phase B closure.

## Evidence
- Archive the user's redacted transcript in `docs/https-pwa/evidence/2026-11-21-backend-live-verification.txt` only after removing host/user-specific secrets.
- If the run fails, paste only `FAIL`/`GAP`/`SUMMARY` lines plus the relevant status codes; never paste `Set-Cookie`, `csrfToken` or password values.
