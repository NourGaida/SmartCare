# 07 — HTTPS/PWA Phase B verification

## Goal
- Close Phase B with one reproducible verification pass over the local HTTPS setup, the single server-mode predicate, the Secure cookie wiring, WildFly proxy forwarding and security headers.
- Record clearly what was verified locally and what still needs the user's elevated host/certificate steps.

## Plain-language explanation
- Think of this as the final inspection before opening the clinic to visitors. The reception desk (nginx) has the TLS certificate, the clinic (WildFly) now understands forwarded HTTPS headers, the patient/staff doors choose the right waiting room from one shared rule, and the cookie is marked `Secure`.
- Some checks can be done from the repository alone (tests, config syntax, script syntax, static file lists). Others need a trusted certificate and real DNS on the PC, which only the user can approve with UAC.

## Why it is needed here
- D2 prevents the two portal entry files from drifting apart when the same app is served at legacy and root-hosted URLs.
- D9 requires Lighthouse evidence, but only after the local CA is trusted and the HTTPS hosts resolve.
- D3 requires legacy HTTP to remain untouched until Phase C verification, so live cutover is deliberately **not** performed here.
- D11 requires a public-safe repo, so all personal clone paths were replaced with `<REPO>`.

## Prerequisites
- B1 hostnames script executed by the user in elevated PowerShell.
- B2 `mkcert -install` and leaf certificate generation executed by the user; `certs/smartcare.local.pem` and `certs/smartcare.local-key.pem` exist and are gitignored.
- JDK 25 via `$env:JAVA_HOME` and MongoDB running on `localhost:27017`.
- Docker Desktop with `nginx:stable` available.
- Chrome at its full path for Lighthouse; `npx lighthouse@12.8.2 --version` was checked.

## Procedure
1. Run the full backend verification:

   ```powershell
   $env:JAVA_HOME='C:\Program Files\Amazon Corretto\jdk25.0.5_0'
   mvn --batch-mode --no-transfer-progress -f middleware/pom.xml clean verify
   ```

   Expected: core 54, iam 14, api 14; 0 failures/errors/skipped; `BUILD SUCCESS`.

   D2 changed lines for the PR description:
   - `frontends/shared/server-mode.mjs:1-5` — new single `isServerMode(location = globalThis.location)` predicate.
   - `frontends/shared/portal.mjs:2,6` — import and call the shared helper.
   - `frontends/frontoffice/portal.mjs:2,6` — import and call the shared helper.
   - `frontends/frontoffice/sw.js`, `frontends/backoffice/sw.js` — helper added to precache/version.
   - `frontends/tests/server-mode.test.mjs:1-30` — legacy path + both root hosts + non-matching origin + helper wiring tests.
   - `.github/workflows/ci.yml:88` — new test included in frontend CI command.

2. Run the full frontend suite:

   ```powershell
   node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs frontends/tests/patient-history.test.mjs frontends/tests/server-mode.test.mjs frontends/tests/nginx-headers.test.mjs
   ```

   Expected: 81 tests pass.

3. Recheck static infrastructure:

   ```powershell
   docker compose -f docker/compose.https.yml config --quiet
    docker run --rm -v "${PWD}\docker\nginx-https.conf:/etc/nginx/conf.d/default.conf:ro" -v "${PWD}\docker\nginx-security-headers.conf:/etc/nginx/snippets/smartcare-security-headers.conf:ro" -v "${PWD}\docker\nginx-mime-types.conf:/etc/nginx/mime.types:ro" -v "${PWD}\certs:/etc/nginx/certs:ro" nginx:stable nginx -t
   docker run --rm -v "${PWD}:/workspace" --entrypoint bash quay.io/wildfly/wildfly:42.0.0.Final-jdk25 -n /workspace/scripts/wildfly-entrypoint.sh
   ```

4. After the user confirms B1/B2, start nginx:

   ```powershell
   docker compose -f docker/compose.https.yml up -d
   ```

5. Check hosts, redirect and headers:

   ```powershell
   curl.exe --ssl-no-revoke -sS -D - -o NUL https://app.smartcare.local/
   curl.exe --ssl-no-revoke -sS -D - -o NUL https://staff.smartcare.local/
   curl.exe --ssl-no-revoke -sS -o NUL -w '%{http_code} %{redirect_url}\n' http://app.smartcare.local/
   nslookup app.smartcare.local
   ```

   Expected: 200 on both HTTPS hosts; 301 from HTTP to HTTPS; HSTS `max-age=300`; exact CSP; no `includeSubDomains`/`preload`.

6. Run the live HTTPS asset smoke script:

   ```powershell
   PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-https.ps1
   ```

   Expected: `SUMMARY pass=61 fail=0`. For both hosts, `/`, `/index.html`, `/frontoffice/index.html` and `/backoffice/index.html` return 200 with `Content-Type: text/html...` and no `Content-Disposition`; css, mjs, svg, png, woff2, json and webmanifest have their expected types; `sw.js` is `no-cache`, 404s are `no-store`, fonts are immutable, and every checked response carries the security headers.

7. Check the authenticated backend path through both HTTPS hosts:

   ```powershell
   $env:SMARTCARE_DEV_EMAIL='patient@smartcare.local'
   $env:SMARTCARE_DEV_PASSWORD='<DEV_PASSWORD_FROM_PASSWORD_MANAGER>'
   PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-https.ps1 -Repo '<REPO>' -WithLogin | Tee-Object -FilePath "$env:TEMP\smartcare-withlogin.txt"
   ```

   Expected: `/api/health` returns the backend body with 200 through the `/api/` rewrite; login returns a `Secure`, `HttpOnly`, `SameSite=Strict`, root-path cookie with no `Domain`; `/api/session`, CSRF negative/positive, logout and role checks match the implemented contract. Final line: `SUMMARY pass=87 fail=0 gap=2`. Live result remains UNVERIFIED until the user pastes redacted output; see [backend-live-verification.md](backend-live-verification.md).

8. Run Lighthouse only after the padlock is trusted:

   ```powershell
   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --version
   npx lighthouse@12.8.2 https://app.smartcare.local/ --only-categories=pwa,performance,accessibility,best-practices --output=json --output-path=docs\https-pwa\evidence\lighthouse-patient.json --chrome-flags="--headless=new --no-sandbox"
   npx lighthouse@12.8.2 https://staff.smartcare.local/ --only-categories=pwa,performance,accessibility,best-practices --output=json --output-path=docs\https-pwa\evidence\lighthouse-staff.json --chrome-flags="--headless=new --no-sandbox"
   ```

9. Paste user-side outputs into `docs/https-pwa/evidence/2026-11-21-https-verification.txt`; add the screenshots listed in `screenshots-todo.md`.
10. Stop here. Do not start Phase C or replace the real `smartcare-wildfly` until the user confirms B1–B6 and approves cutover.

## Files created or modified
- `frontends/shared/server-mode.mjs` — new shared D2 predicate.
- `frontends/shared/portal.mjs`, `frontends/frontoffice/portal.mjs` — use the predicate.
- `frontends/frontoffice/sw.js`, `frontends/backoffice/sw.js` — precache helper and no-404 caching rules.
- `frontends/shared/sw-kill.js` — dormant one-time maintenance worker.
- `frontends/tests/server-mode.test.mjs` — D2 regression tests.
- `frontends/tests/nginx-headers.test.mjs` — static nginx header/MIME regression tests.
- `docker/nginx-https.conf`, `docker/compose.https.yml` — root-accurate asset routing, error no-store, global MIME mount and security snippet mount.
- `docker/nginx-security-headers.conf` — shared nginx security headers.
- `docker/nginx-mime-types.conf` — complete global MIME table (upstream table plus `mjs` and `webmanifest`).
- `scripts/smoke-https.ps1` — live GET smoke test for both HTTPS hosts, plus optional `-WithLogin` backend/cookie/CSRF checks with temporary out-of-repo cookie jars.
- `scripts/recreate-wildfly.ps1` — inspect-and-recreate helper with preserving settings, deployment export, verification and rollback.
- `.github/workflows/ci.yml` — frontend test command includes both new tests.
- `docs/decisions/ADR-0008-server-mode.md`, `docs/decisions/ADR-0009-service-worker-kill-switch.md`, `docs/decisions/ADR-0010-global-mime-table.md`, `docs/decisions/ADR-0012-https-backend-verification.md`, `docs/decisions/ADR-0013-robust-wildfly-recreation.md`, `docs/decisions/ADR-0014-local-first-security-headers.md` — decision records.
- `docs/https-pwa/07-https-verification.md` — this step document.
- `docs/https-pwa/backend-live-verification.md` — user-run authenticated backend verification guide.
- `docs/https-pwa/security-hygiene.md` — read-only secret/path/port audit and issue-ready hardening gaps.
- `docs/https-pwa/evidence/2026-11-21-https-verification.txt`, `docs/https-pwa/evidence/2026-11-21-full-verify.txt`, `docs/https-pwa/evidence/2026-11-21-smoke-https.txt`, `docs/https-pwa/evidence/2026-11-21-root-mime-types.txt` — evidence.
- `docs/README.md` — JDK 25/MongoDB test prerequisites.
- `docs/https-pwa/02-hostnames.md`, `03-local-certificates.md`, evidence files — personal paths replaced with `<REPO>`.
- `docs/https-pwa/README.md`, `14-troubleshooting.md`, `screenshots-todo.md`, `docs/CHANGELOG.md` — live updates.

## Verification
- **VERIFIED 2026-11-21** locally:
  - `mvn --batch-mode --no-transfer-progress -f middleware/pom.xml clean verify` → core 54, iam 14, api 14, 0 failures/errors/skipped, `BUILD SUCCESS` (rerun in final closure).
  - Frontend suite → 81 tests, 81 pass, 0 fail, 0 skipped (D2 + SW + nginx regression and API rewrite tests).
  - `docker compose -f docker/compose.https.yml config --quiet` → exit 0.
  - `nginx:stable nginx -t` with the security snippet, complete global MIME table and a throwaway cert outside the repo → syntax ok / test successful.
  - `docker exec smartcare-nginx-https nginx -t` before and after `up -d --force-recreate` → syntax ok / test successful.
  - `bash -n scripts/wildfly-entrypoint.sh` in the WildFly image → exit 0.
  - `scripts/smoke-https.ps1` → `SUMMARY pass=61 fail=0` on both HTTPS hosts, including root HTML and MIME checks.
  - `scripts/recreate-wildfly.ps1 -DryRun` → inspected `smartcare-wildfly`, printed redacted counts and target image/restart policy, changed no Docker state.
  - Security hygiene audit → no tracked sensitive filenames or personal paths, all four cert/key paths ignored, current CSP/HSTS reviewed, port/role/hardening gaps recorded.
  - D2 reproduction → `isServerMode=true` for `app.smartcare.local`, `staff.smartcare.local` and both legacy `/smartcare/frontends/...` paths.
  - Tool versions: mkcert v1.4.4, Docker Compose v5.1.1, Node v22.17.0, Lighthouse 12.8.2.
- **VERIFIED by user/live curl 2026-11-21**:
  - host entries and pings for the HTTPS names;
  - mkcert CA trust and leaf certificate generation;
  - HTTPS asset 200s via `curl.exe --ssl-no-revoke`, including `styles.css`, `portal.mjs` and `icon.svg`.
- **UNVERIFIED**:
  - 80→443 redirect from the live host;
  - `/api/` rewrite, `Secure` `Set-Cookie`, CSRF and logout from the live WildFly container (`-WithLogin`);
  - firewall and WildFly apply-command outputs were not pasted;
  - final Chrome result after clearing the stale worker/cache, including Incognito;
  - Lighthouse scores and padlock screenshots;
  - real WildFly container replacement using `scripts/recreate-wildfly.ps1 -Force`.

## Final status matrix

| Area | Status | Evidence / next action |
| --- | --- | --- |
| B1 hostnames | VERIFIED by user | Host entries and pings confirmed; 80→443 redirect still needs user paste. |
| B2 certificates | VERIFIED by user | mkcert CA trust, leaf generation and padlock confirmed; cert/key files ignored. |
| B3 HTTPS/nginx | VERIFIED | `nginx -t` passed before/after force recreate; default smoke `pass=61 fail=0`; global MIME table fixed. |
| B4 cookie code | VERIFIED locally | `SMARTCARE_SESSION_SECURE` profile wiring and 14 IAM tests pass; live secure cookie UNVERIFIED. |
| B5 WildFly proxy image | VERIFIED in disposable container | Startup marker, CLI read-back and env verified on test ports; real `-Force` recreation UNVERIFIED. |
| B6 D2/headers/SW | VERIFIED | 81 frontend tests pass; security headers, no-cache/no-store and MIME regressions covered. |
| Browser routing incident | VERIFIED by user | VPN-off fixed the routing bypass; documented in ADR-0011 and browser-state guide. |
| Authenticated backend | UNVERIFIED | User must run `-WithLogin`; expected `SUMMARY pass=87 fail=0 gap=2`. |
| Real WildFly recreation | UNVERIFIED | User must run `scripts/recreate-wildfly.ps1 -DryRun` then `-Force` if approving cutover. |
| Security hygiene | VERIFIED locally | No tracked sensitive names, four cert/key paths ignored, no Windows user-directory prefix; port/header/role gaps recorded. |
| Lighthouse/installability | DEFERRED | Phase C. |
| Phone access/CA | DEFERRED | Phase D. |
| Push/merge | NOT DONE | Explicitly excluded from this task. |

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| D2 test fails on `app.smartcare.local` | Host regex changed or default argument removed. | Keep `/(^|\.)smartcare\.local$/` and default `globalThis.location`. |
| Frontend offline boot misses `server-mode.mjs` | Helper not added to SW precache arrays. | Re-add `"../shared/server-mode.mjs"` to both SW files and bump cache version. |
| Maven still uses Java 17 | `JAVA_HOME` not overridden in this shell. | Set it to JDK 25 before `mvn`; see `docs/README.md`. |
| Lighthouse reports insecure context | mkcert CA not trusted or hosts not resolving. | Complete B1/B2 as admin and re-run; do not disable HTTPS checks. |
| Chrome shows `404 ()` while curl returns 200 | Stale service worker or HTTP cache from a cached 404 response. | Confirm with `curl.exe --ssl-no-revoke`; unregister the SW and clear site data; use the dormant kill-switch only if needed (ADR-0009). |
| Browser downloads the page instead of rendering it | A location-level `types` override dropped `text/html` after `try_files` internally redirected `/` to `/frontoffice/index.html` or `/backoffice/index.html`. | Use `curl.exe --ssl-no-revoke -D - -o NUL https://app.smartcare.local/` and check `Content-Type`; use the complete global MIME table from ADR-0010; keep `nosniff`. |

Also appended to [14-troubleshooting.md](14-troubleshooting.md).

## Security notes
- No certificate, key, token or real patient data is committed; `certs/` remains ignored.
- The CSP is exactly the D8 policy; HSTS remains deliberately short (`max-age=300`) for local testing.
- D2 does not add a fallback for arbitrary hosts; only the legacy path and `*.smartcare.local` hosts enter server mode.
- Lighthouse JSON may contain local URLs only; scrub before publishing if needed.
- Public exposure/tunnels remain Phase D documentation only.

## Rollback
- Revert the D2 files to restore the duplicated path checks; remove `frontends/tests/server-mode.test.mjs` and ADR-0008.
- Revert the nginx config, global MIME table, SW files, `scripts/smoke-https.ps1`, `frontends/tests/nginx-headers.test.mjs`, `frontends/shared/sw-kill.js`, ADR-0009 and ADR-0010 if the incident fixes are not wanted.
- Revert `docs/README.md` note if the repository later standardises JDK/Mongo setup elsewhere.
- The live nginx container was restarted to apply the incident fix; no legacy WildFly service was changed.

## Decisions and alternatives
- Accepted [ADR-0008](../decisions/ADR-0008-server-mode.md): one shared predicate.
- Accepted [ADR-0009](../decisions/ADR-0009-service-worker-kill-switch.md): dormant one-time kill-switch only.
- Accepted [ADR-0010](../decisions/ADR-0010-global-mime-table.md): complete global MIME table, no location overrides.
- Accepted [ADR-0012](../decisions/ADR-0012-https-backend-verification.md): lockout-safe authenticated smoke checks.
- Accepted [ADR-0013](../decisions/ADR-0013-robust-wildfly-recreation.md): inspect-and-recreate with rollback.
- Accepted [ADR-0014](../decisions/ADR-0014-local-first-security-headers.md): local-first headers and deferred production hardening.
- Rejected duplicated checks and broad `href.includes('smartcare')` fallback.
- Rejected permanent kill-switch workers, cached 404 responses and partial MIME tables.
- Kept B6 as verification + documentation only; Phase C cutover is a separate user-approved step.

## References
- [B5 proxy forwarding](06-wildfly-proxy.md)
- [B4 cookie security](05-session-cookie-security.md)
- [B3 nginx TLS](04-nginx-tls.md)
- [Node test runner](https://nodejs.org/api/test.html)
- [Lighthouse CLI](https://developer.chrome.com/docs/lighthouse/overview/cli)
