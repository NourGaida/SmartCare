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
   node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs frontends/tests/patient-history.test.mjs frontends/tests/server-mode.test.mjs
   ```

   Expected: 75 tests pass.

3. Recheck static infrastructure:

   ```powershell
   docker compose -f docker/compose.https.yml config --quiet
   docker run --rm -v "${PWD}\docker\nginx-https.conf:/etc/nginx/conf.d/default.conf:ro" -v "${PWD}\certs:/etc/nginx/certs:ro" nginx:stable nginx -t
   docker run --rm -v "${PWD}:/workspace" --entrypoint bash quay.io/wildfly/wildfly:42.0.0.Final-jdk25 -n /workspace/scripts/wildfly-entrypoint.sh
   ```

4. After the user confirms B1/B2, start nginx:

   ```powershell
   docker compose -f docker/compose.https.yml up -d
   ```

5. Check hosts, redirect and headers:

   ```powershell
   curl.exe -kI https://app.smartcare.local/
   curl.exe -kI https://staff.smartcare.local/
   curl.exe -sS -o NUL -w '%{http_code} %{redirect_url}\n' http://app.smartcare.local/
   nslookup app.smartcare.local
   ```

   Expected: 200 on both HTTPS hosts; 301 from HTTP to HTTPS; HSTS `max-age=300`; exact CSP; no `includeSubDomains`/`preload`.

6. Check API rewrite and session cookie:

   ```powershell
   curl.exe -k -i https://app.smartcare.local/api/session
   ```

   Expected: not a 404 from `/api/...`; `Set-Cookie: SMARTCARE_SESSION=...; Path=/; HttpOnly; SameSite=Strict; Secure` when the HTTPS WildFly image from B5 is used.

7. Run Lighthouse only after the padlock is trusted:

   ```powershell
   & 'C:\Program Files\Google\Chrome\Application\chrome.exe' --version
   npx lighthouse@12.8.2 https://app.smartcare.local/ --only-categories=pwa,performance,accessibility,best-practices --output=json --output-path=docs\https-pwa\evidence\lighthouse-patient.json --chrome-flags="--headless=new --no-sandbox"
   npx lighthouse@12.8.2 https://staff.smartcare.local/ --only-categories=pwa,performance,accessibility,best-practices --output=json --output-path=docs\https-pwa\evidence\lighthouse-staff.json --chrome-flags="--headless=new --no-sandbox"
   ```

8. Paste user-side outputs into `docs/https-pwa/evidence/2026-11-21-https-verification.txt`; add the screenshots listed in `screenshots-todo.md`.
9. Stop here. Do not start Phase C or replace the real `smartcare-wildfly` until the user confirms B1–B6 and approves cutover.

## Files created or modified
- `frontends/shared/server-mode.mjs` — new shared D2 predicate.
- `frontends/shared/portal.mjs`, `frontends/frontoffice/portal.mjs` — use the predicate.
- `frontends/frontoffice/sw.js`, `frontends/backoffice/sw.js` — precache helper.
- `frontends/tests/server-mode.test.mjs` — D2 regression tests.
- `.github/workflows/ci.yml` — frontend test command includes the new test.
- `docs/decisions/ADR-0008-server-mode.md` — D2 decision record.
- `docs/https-pwa/07-https-verification.md` — this step document.
- `docs/https-pwa/evidence/2026-11-21-https-verification.txt`, `docs/https-pwa/evidence/2026-11-21-full-verify.txt` — evidence.
- `docs/README.md` — JDK 25/MongoDB test prerequisites.
- `docs/https-pwa/02-hostnames.md`, `03-local-certificates.md`, evidence files — personal paths replaced with `<REPO>`.
- `docs/https-pwa/README.md`, `14-troubleshooting.md`, `screenshots-todo.md`, `docs/CHANGELOG.md` — live updates.

## Verification
- **VERIFIED 2026-11-21** locally:
  - `mvn --batch-mode --no-transfer-progress -f middleware/pom.xml clean verify` → core 54, iam 14, api 14, 0 failures/errors/skipped, `BUILD SUCCESS`.
  - Frontend suite → 75 tests, 75 pass, 0 fail, 0 skipped (includes 4 new D2 tests).
  - `docker compose -f docker/compose.https.yml config --quiet` → exit 0.
  - `nginx:stable nginx -t` with a throwaway cert outside the repo → syntax ok / test successful.
  - `bash -n scripts/wildfly-entrypoint.sh` in the WildFly image → exit 0.
  - Tool versions: mkcert v1.4.4, Docker Compose v5.1.1, Node v22.17.0, Lighthouse 12.8.2.
- **UNVERIFIED** because user-side elevated/live steps are pending:
  - host file entries and `nslookup` for the three names;
  - mkcert CA trust and leaf certificate presence in `certs/`;
  - live HTTPS 200s, 80→443 redirect, HSTS/CSP headers, `/api/` rewrite, `Secure` `Set-Cookie`;
  - Lighthouse scores and padlock screenshots;
  - real WildFly container using the B5 image.

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| D2 test fails on `app.smartcare.local` | Host regex changed or default argument removed. | Keep `/(^|\.)smartcare\.local$/` and default `globalThis.location`. |
| Frontend offline boot misses `server-mode.mjs` | Helper not added to SW precache arrays. | Re-add `"../shared/server-mode.mjs"` to both SW files and bump cache version. |
| Maven still uses Java 17 | `JAVA_HOME` not overridden in this shell. | Set it to JDK 25 before `mvn`; see `docs/README.md`. |
| Lighthouse reports insecure context | mkcert CA not trusted or hosts not resolving. | Complete B1/B2 as admin and re-run; do not disable HTTPS checks. |

Also appended to [14-troubleshooting.md](14-troubleshooting.md).

## Security notes
- No certificate, key, token or real patient data is committed; `certs/` remains ignored.
- The CSP is exactly the D8 policy; HSTS remains deliberately short (`max-age=300`) for local testing.
- D2 does not add a fallback for arbitrary hosts; only the legacy path and `*.smartcare.local` hosts enter server mode.
- Lighthouse JSON may contain local URLs only; scrub before publishing if needed.
- Public exposure/tunnels remain Phase D documentation only.

## Rollback
- Revert the D2 files to restore the duplicated path checks; remove `frontends/tests/server-mode.test.mjs` and ADR-0008.
- Revert `docs/README.md` note if the repository later standardises JDK/Mongo setup elsewhere.
- No live service was changed by this verification step.

## Decisions and alternatives
- Accepted [ADR-0008](../decisions/ADR-0008-server-mode.md): one shared predicate.
- Rejected duplicated checks and broad `href.includes('smartcare')` fallback.
- Kept B6 as verification + documentation only; Phase C cutover is a separate user-approved step.

## References
- [B5 proxy forwarding](06-wildfly-proxy.md)
- [B4 cookie security](05-session-cookie-security.md)
- [B3 nginx TLS](04-nginx-tls.md)
- [Node test runner](https://nodejs.org/api/test.html)
- [Lighthouse CLI](https://developer.chrome.com/docs/lighthouse/overview/cli)
