# HTTPS/PWA security hygiene audit

## Goal
- Check that the repository does not track secrets or personal paths, confirm certificate files are ignored, summarise the current port exposure, and record production security gaps without changing application or infrastructure behavior.

## Status
| Check | Status |
| --- | --- |
| Tracked sensitive filenames | VERIFIED — no matches |
| Certificate/key ignore rules | VERIFIED — all four files ignored by `.gitignore:51` |
| Personal paths in tracked files | VERIFIED — no matches |
| Current CSP/HSTS values | VERIFIED locally; production hardening DEFERRED |
| Cross-app role gap | OPEN — issue-ready below |
| Port exposure | VERIFIED locally; several hardening gaps OPEN |
| Live secure-cookie/CSRF evidence | UNVERIFIED — see [backend live verification](backend-live-verification.md) |

## User-run commands (Administrator: no)
Run from the repository root. These commands are read-only.

```powershell
git ls-files | Select-String -Pattern 'pem|key|\.env|CAROOT|rootCA'
git check-ignore -v certs/smartcare.local.pem certs/smartcare.local-key.pem certs/ca/rootCA.pem certs/ca/rootCA-key.pem
$windowsUsers = [string]::Concat('C',':',[IO.Path]::DirectorySeparatorChar,'Users',[IO.Path]::DirectorySeparatorChar)
$personalPattern = [regex]::Escape($windowsUsers)
$matches = git grep -n -I -E $personalPattern -- .; if ($LASTEXITCODE -eq 1) { 'NO_PERSONAL_PATHS_IN_TRACKED_FILES' } else { $matches }
netstat -ano | Select-String ':80\s|:443\s|:8080\s|:8081\s|:8082\s|:27017\s|:1883\s'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
```

Expected repository checks:
- First command: no output.
- Second command: four lines showing `.gitignore:51:certs/*` for each certificate/key path.
- Third command: `NO_PERSONAL_PATHS_IN_TRACKED_FILES`.
- Fourth/fifth commands: local environment output; review, do not commit raw PIDs or unrelated external connections.

## Observed 2026-11-21 (redacted)
- `git ls-files | Select-String ...`: no tracked filenames containing `pem`, `key`, `.env`, `CAROOT` or `rootCA`.
- `git check-ignore -v`: all four expected certificate/key paths matched `.gitignore:51:certs/*`.
- `git grep`: no Windows user-directory prefix in tracked files. Author names in `README.md` and `attribution.md` are intentional credits and are not path leakage.
- `docker ps`:
  - `smartcare-nginx-https`: `nginx:stable`, `0.0.0.0:80->80/tcp`, `0.0.0.0:443->443/tcp`, Up.
  - `smartcare-wildfly`: `smartcare-wildfly-proxy:local`, `0.0.0.0:8080->8080/tcp`, Up.
  - `smartcare-mongodb`: `mongo:8.0`, `0.0.0.0:27017->27017/tcp`, Up.
  - `smartcare-mosquitto`: loopback-only `127.0.0.1:1883->1883/tcp`, Up.
  - `smartcare-nodered`: loopback-only `127.0.0.1:1880->1880/tcp`, Up.
  - `stoic_swartz`: base WildFly image, `8080/tcp` not published, Up.
- `netstat`: no listeners on legacy `8081`/`8082` during this audit.
- The image name for `smartcare-wildfly` is encouraging but is not live evidence of `SMARTCARE_SESSION_SECURE=true`, startup logs or CSRF behavior; those remain UNVERIFIED until the recreation/backend commands are run.

## Header review
`docker/nginx-security-headers.conf` currently sends exactly:

```
Strict-Transport-Security: max-age=300
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Cross-Origin-Opener-Policy: same-origin
```

This is intentional for local mkcert testing. See [ADR-0014](../decisions/ADR-0014-local-first-security-headers.md).

## Issue-ready gaps

### SEC-1 — Production HSTS/CSP policy
- Evidence: local HSTS is `max-age=300` and CSP is D8-exact; no production domain or CA.
- Impact: a real deployment needs a valid CA, a longer HSTS decision after all subdomains are verified, and CSP review for any new assets or WebSocket origins.
- Suggested fix: create a production header profile in a separate change; never add `includeSubDomains`/`preload` for the local mkcert profile.
- Phase: production hardening.
- Verification: curl headers on the production hostname plus a CSP violation report review.

### SEC-2 — WildFly and MongoDB exposed on all interfaces
- Evidence: `0.0.0.0:8080` and `0.0.0.0:27017` listeners.
- Impact: local lab exposure wider than a hardened deployment should allow.
- Suggested fix: design an internal Docker network or loopback/host firewall rules in a separately approved change. Do not change it blindly because nginx uses `host.docker.internal:8080`.
- Phase: Phase C cutover or production hardening.
- Verification: `docker ps` and `netstat` show only intended listeners; HTTPS smoke still passes.

### SEC-3 — Cross-app role segregation
- Evidence: `SecurityFilter` authenticates any valid session; only `PatientMeasurementsResource` rejects non-patient roles. No staff-only backend route exists.
- Impact: a patient session is rejected client-side on the staff portal, but the backend does not enforce staff-role access for all staff routes.
- Suggested fix: add backend role guards to staff-only resources during login completion and cover them with `-WithLogin` checks.
- Phase: login-completion task (not Phase B).
- Verification: patient session gets 403 on staff-only API routes; professional/admin session gets 403 on patient-only routes; both hosts pass smoke.

### SEC-4 — Unpublished extra WildFly container
- Evidence: `stoic_swartz` runs the base WildFly image with no published ports.
- Impact: low; consumes resources and may confuse later audits.
- Suggested fix: confirm it is the B5 test container, then remove it only with explicit user approval.
- Phase: cleanup after Phase B evidence is accepted.
- Verification: `docker ps` no longer lists `stoic_swartz`.

## Non-changes
- No nginx, service-worker, application, MongoDB or firewall settings were changed for this audit.
- No certificates, keys, cookies, tokens, passwords or personal paths were added to the repository.
