# PR draft — Phase B HTTPS/PWA verification closure

- Base: `main`
- Head: `feature/https-pwa`
- Status: ready for review, not pushed, not merged.
- Scope: Phase B only. Phase C PWA work and Phase D phone access remain out of scope.

## Summary
- Added local HTTPS hostnames, mkcert CA workflow, nginx TLS termination, strict local CSP/HSTS, same-origin `/api/` rewrite, self-hosted OFL fonts and nginx-only Compose.
- Made the session cookie `Secure` flag profile-driven and added idempotent WildFly proxy-address-forwarding startup wiring.
- Unified legacy/root-host detection behind one `isServerMode()` predicate and added regression tests.
- Fixed real HTTPS incidents found during verification: script `Test-Path` binding, root asset routing, cached 404s/stale service-worker assets, missing security headers, `.mjs` MIME type and the partial location-level MIME table.
- Added live smoke checks for assets/headers and lockout-safe authenticated backend checks for both HTTPS hosts.
- Added robust WildFly recreation with dry-run, preserved container settings, deployment export, verification and rollback.
- Documented the confirmed browser VPN/secure-DNS routing incident and browser-state clearing steps.
- Audited repository secrets, ignore rules, personal paths, headers and port exposure; recorded issue-ready hardening gaps.

## Files by area
- nginx/TLS: `docker/nginx-https.conf`, `docker/nginx-security-headers.conf`, `docker/nginx-mime-types.conf`, `docker/compose.https.yml`.
- WildFly: `docker/Dockerfile.wildfly-proxy`, `scripts/wildfly-proxy.cli`, `scripts/wildfly-entrypoint.sh`, `scripts/recreate-wildfly.ps1`.
- Scripts: `scripts/setup-hosts.ps1`, `scripts/gen-certs.ps1`, `scripts/smoke-https.ps1`, `scripts/recreate-wildfly.ps1`, `scripts/README.md`.
- Frontend/PWA: `frontends/shared/server-mode.mjs`, `frontends/shared/sw-kill.js`, both `sw.js` files, `frontends/frontoffice/styles.css`, self-hosted fonts.
- Backend: `middleware/iam/.../SessionSettings.java` and its tests.
- CI/tests: `.github/workflows/ci.yml`, `frontends/tests/*.test.mjs`.
- Docs: `docs/https-pwa/*`, `docs/decisions/ADR-0001..ADR-0014`, `docs/CHANGELOG.md`, `docs/README.md`, `attribution.md`.

## Commits
- `be7d98d` docs(audit): add HTTPS/PWA audit and documentation skeleton
- `a78f3bd` docs(changelog): record Phase A commit hash
- `5cdb931` docs: scrub personal paths and correct baseline test counts
- `6a8171c` docs(https-pwa): add B1 local hostname bootstrap
- `240a792` docs(changelog): record B1 commit hash
- `047075a` docs(https-pwa): add B2 mkcert certificate setup
- `3e05302` docs(changelog): record B2 commit hash
- `87a1bd6` feat(https-pwa): add B3 HTTPS proxy and self-hosted fonts
- `2c0f7a1` docs(changelog): record B3 commit hash
- `8dbffbf` feat(iam): make session cookie Secure flag configurable
- `75a10fb` docs(changelog): record B4 commit hash
- `d8962c3` feat(wildfly): add idempotent proxy forwarding startup image
- `2a27566` docs(changelog): record B5 commit hash
- `52107ec` feat(https): finish phase B verification and D2 portal predicate
- `1fe141e` docs(changelog): record B6 commit hash
- `1e343a8` fix(scripts): correct Test-Path condition and add dry-run checks
- `c34fb93` fix(nginx): route HTTPS asset requests to app roots
- `e4f8639` fix(https): prevent cached 404s and stale assets
- `eecc431` docs(changelog): record HTTPS incident fix hash
- `ec7cfe9` fix(nginx): use complete global MIME table
- `3986edd` docs(changelog): record MIME incident fix hash
- `d1b01fc` docs(https): document VPN routing and browser state incident
- `0d97bdb` docs(changelog): record VPN incident docs hash
- `1dfa557` test(https): add authenticated backend smoke checks
- `2a2bcf3` docs(changelog): record backend smoke checks hash
- `efe2569` feat(scripts): add robust WildFly recreation helper
- `135bb3c` docs(changelog): record WildFly recreation hash
- `c619e0a` docs(security): audit hygiene and record hardening gaps
- `e6dc8f4` docs(changelog): record security audit hash

## Test results
| Check | Status | Result |
| --- | --- | --- |
| Backend Maven | VERIFIED (evidence) | core 54, iam 14, api 14, 0 failures/errors/skipped |
| Frontend Node suite | VERIFIED | 81 tests, 81 pass, 0 fail, 0 skipped |
| `docker compose -f docker/compose.https.yml config --quiet` | VERIFIED | exit 0 |
| `nginx:stable nginx -t` with mounted config/headers/MIME/cert | VERIFIED | syntax ok |
| `docker exec smartcare-nginx-https nginx -t` after force recreate | VERIFIED | syntax ok |
| WildFly entrypoint `bash -n` | VERIFIED (evidence) | exit 0 |
| `scripts/smoke-https.ps1` default GET checks | VERIFIED | `SUMMARY pass=61 fail=0` |
| PowerShell parser for both scripts | VERIFIED | parse exit 0 |
| `scripts/recreate-wildfly.ps1 -DryRun` | VERIFIED | inspected container, redacted summary, no Docker changes |
| Tracked secret/personal-path audit | VERIFIED | no tracked sensitive names or personal paths; cert/key files ignored |
| `-WithLogin` live backend checks | UNVERIFIED | user must run and paste redacted output |
| Real WildFly recreation with `-Force` | UNVERIFIED | user must approve/run and paste redacted output |
| Lighthouse/installability | DEFERRED | Phase C |
| Phone access/CA | DEFERRED | Phase D |

## User manual verification (one command per line)
All commands are non-admin, assuming Docker Desktop is already running. Stop before Phase C and do not push or merge.

### 1. WildFly recreation dry-run
```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\recreate-wildfly.ps1 -DryRun
```
Expected: `CONTAINER smartcare-wildfly`, `secure=true`, `DRY RUN: ... no Docker state changed.`

### 2. Optional approved WildFly recreation
```powershell
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\recreate-wildfly.ps1 -Force
```
Expected: `SmartCare WildFly proxy forwarding verified.`, `PASS jboss-cli :: proxy-address-forwarding=true`, `PASS environment :: SMARTCARE_SESSION_SECURE=true`, `PASS restart policy :: unless-stopped`, `SUMMARY recreate=verified rollback=not-needed`. Brief nginx 502 during the swap is expected.

### 3. Authenticated backend checks on both HTTPS hosts
```powershell
$env:SMARTCARE_DEV_EMAIL='patient@smartcare.local'
$env:SMARTCARE_DEV_PASSWORD='<DEV_PASSWORD_FROM_PASSWORD_MANAGER>'
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-https.ps1 -Repo '<REPO>' -WithLogin
```
Expected: health 200 through `/api/`, login cookie with `Secure`, `HttpOnly`, `SameSite=Strict`, root path and no `Domain`; session/CSRF/logout checks pass; final line `SUMMARY pass=87 fail=0 gap=2`.

### 4. Browser routing sanity
```powershell
nslookup app.smartcare.local
```
Expected: resolves to the LAN IP used in hosts. In DevTools Network, Remote Address must be the same IP on `443`; browser VPN/proxy/secure DNS must be off.

## Gaps / follow-up issues
- **LOGIN-1 cross-app role enforcement:** no backend staff-only route rejects a patient session; add role guards and `-WithLogin` cases before installed-mode login work.
- **SEC-1 production headers:** migrate from local mkcert/HSTS `max-age=300` to a production header profile with reviewed CSP and HSTS only after all subdomains are verified.
- **SEC-2 port exposure:** WildFly `8080` and MongoDB `27017` listen on all interfaces; design an internal network or host firewall change in Phase C/production, not blindly in Phase B.
- **SEC-4 test container cleanup:** `stoic_swartz` is an unpublished WildFly container from B5; remove only with explicit approval after evidence is accepted.
- **PHASE-C PWA:** Lighthouse, install prompt, offline shell and installed-mode login remain deferred.
- **PHASE-D phone:** LAN DNS/CA setup and VPN/Private DNS caveats remain deferred.

## Screenshots requested
- `docs/img/03-certificate-padlock.png` — padlock on `https://app.smartcare.local`.
- `docs/img/06-wildfly-cli.png` — CLI read-back showing `proxy-address-forwarding=true` with no secrets.
- `docs/img/07-curl-login-csrf.png` — terminal with CSRF 403/204 and cookie flags; redact cookie values and tokens.
- `docs/img/07-browser-headers.png` — DevTools Network showing HSTS/CSP and padlock.
- Optionally a screenshot of DevTools Remote Address matching the LAN IP for the VPN incident.

## Rollback
- Revert the branch or selected commits; no merge has been performed.
- Live nginx container changes can be reverted by restoring the previous `docker/nginx-https.conf` and recreating `smartcare-nginx-https`.
- If WildFly recreation fails, `scripts/recreate-wildfly.ps1` restores the original container configuration automatically; MongoDB data is never recreated.
- Browser cache/service-worker issues can use the dormant one-time kill-switch in ADR-0009, then revert it.
