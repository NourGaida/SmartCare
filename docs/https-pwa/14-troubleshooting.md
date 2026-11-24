# 14 — Consolidated troubleshooting

Living document. Add a row for every realistic problem found in a step doc; keep the step doc as the detailed source.

| Step | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| A (audit) | `mvn clean verify` fails with `MongoTimeoutException: localhost:27017`. | `smartcare-mongodb` container stopped. | `docker start smartcare-mongodb`; rerun with `JAVA_HOME` set to JDK 25. |
| A (audit) | Maven uses Java 17 although `java -version` is 25. | `JAVA_HOME` points to `jdk17.0.18_9`. | `$env:JAVA_HOME='C:\Program Files\Amazon Corretto\jdk25.0.5_0'`. |
| A (audit) | A test file contains `192.168.1.4`. | Node test fixture, not runtime frontend code. | No action in Phase A; re-check acceptance criterion in Phase C. |
| B1 | `Run this from an elevated PowerShell...` | Terminal lacks admin token. | Reopen as *Windows Terminal (Admin)* and approve UAC. |
| B1 | `nslookup app.smartcare.local` returns a public IP | VPN/DNS cache shadows hosts file. | `ipconfig /flushdns`; disconnect VPN; `nslookup app.smartcare.local 127.0.0.1`. |
| B1 | Phone cannot open the names | Hosts file is PC-only. | Expected until Phase D dnsmasq/tunnel. |
| B6 incident | Page loads partly, unstyled, broken logo or `Demonstration mode` while curl returns 200 | Built-in browser VPN, secure DNS or proxy sends `*.smartcare.local` to a remote server, bypassing the Windows hosts file. User confirmed VPN-off fixed both hosts. | DevTools Network → Remote Address must be `192.168.1.4:443`; turn VPN/proxy/secure DNS off; try a private window; see [clear-browser-state.md](clear-browser-state.md) and ADR-0011. |
| B2 | `Local CA not trusted yet` | `mkcert -install` ran without project `CAROOT`. | Set `$env:CAROOT=(Resolve-Path .\certs\ca).Path`, run `mkcert -install`, then `scripts/gen-certs.ps1`. |
| B2 | `... is NOT ignored by git` | `.gitignore` pattern missing or wrong working directory. | Restore patterns in `certs/README.md`; run scripts from repo root. |
| B2 incident | `Test-Path : Impossible de lier le paramètre, car le paramètre LiteralPath est spécifié plusieurs fois.` | `gen-certs.ps1:22` used `Test-Path -LiteralPath $cert -or Test-Path -LiteralPath $key`; each cmdlet call in a boolean expression needs its own parentheses. | Fixed to `((Test-Path -LiteralPath $cert) -or (Test-Path -LiteralPath $key))`. Verified with `-DryRun`; re-run `PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gen-certs.ps1`. |
| B2 | Browser warns after B3 | CA installed in different CAROOT or Firefox NSS store. | Check `mkcert -CAROOT`; reinstall with `TRUST_STORES=system,java,nss`. |
| B3 | `nginx: [emerg] cannot load certificate` | B2 certs missing or wrong `CAROOT`. | Run `scripts/gen-certs.ps1`; confirm `<REPO>\certs` bind in `docker compose config`. |
| B3 | `bind: address already in use` on 80/443 | IIS/Apache/other proxy owns the port. | `netstat -ano | findstr :443`; stop owner or approve a new port ADR. |
| B3 | `502 Bad Gateway` on `/api/` | WildFly stopped or `host.docker.internal` not mapped. | Check `docker ps`; confirm `host.docker.internal=host-gateway` in Compose config. |
| B3 | Staff CSS/fonts missing | `/frontoffice/` sibling location or `frontends/` bind absent. | Verify `location ^~ /frontoffice/` and read-only `<REPO>\frontends` mount. |
| B4 | `invalid accessor method in record` | Private helper named `secureCookie()`. | Rename helper to `readSecureCookie()`. |
| B4 | Legacy login logs out immediately | `SMARTCARE_SESSION_SECURE=true` on plain HTTP. | Unset the variable on the legacy container; keep it only in HTTPS profile. |
| B4 | HTTPS cookie lacks `Secure` | Missing property/env on WildFly. | Recreate HTTPS WildFly with `SMARTCARE_SESSION_SECURE=true`; check B6 header. |
| B5 | Container exits immediately with no logs | `ENTRYPOINT` set without `CMD`. | Keep `CMD ["/opt/jboss/wildfly/bin/standalone.sh","-b","0.0.0.0"]`. |
| B5 | `Proxy CLI returned non-zero` | Expected disconnect after `:reload`. | Allow it; verify final `proxy-address-forwarding=true`. |
| B5 | `proxy-address-forwarding is not true` | Wrong CLI address or management auth. | Probe Undertow child names with `jboss-cli.sh --commands='embed-server, /subsystem=undertow:read-children-names(child-type=server)'`. |
| B6 | D2 test fails on `app.smartcare.local` | Host regex changed or default argument removed. | Keep `/(^|\.)smartcare\.local$/` and default `globalThis.location`. |
| B6 | Frontend offline boot misses `server-mode.mjs` | Helper not added to SW precache arrays. | Re-add `"../shared/server-mode.mjs"` to both SW files and bump cache version. |
| B6 | Maven still uses Java 17 | `JAVA_HOME` not overridden in this shell. | Set it to JDK 25 before `mvn`; see `docs/README.md`. |
| B6 | Lighthouse reports insecure context | mkcert CA not trusted or hosts not resolving. | Complete B1/B2 as admin and re-run; do not disable HTTPS checks. |
| B6 | Chrome shows `404 ()` for assets while `curl.exe --ssl-no-revoke` returns 200 | Stale service worker or HTTP cache from a previously cached 404. | Confirm with curl first; unregister SW and clear site data; if still stuck, use the dormant one-time kill-switch in ADR-0009 only, then revert it. |
| B3 | Missing asset returns `404` with `Cache-Control: public, max-age=3600` | Generic 404 inherited the 200-asset cache header; location-level `add_header` also hid security headers. | `error_page 404 500 502 503 504 @smartcare_error;` plus `@smartcare_error` with `Cache-Control: no-store always`; include the security snippet in every header-setting location. |
| B3 | `.mjs` served as `application/octet-stream` | A location-level partial `types` table replaced the standard table. | Remove all location `types`/`default_type` overrides and mount the complete table at `/etc/nginx/mime.types` (ADR-0010). |
| B3 | Browser downloads the page instead of rendering it | `/` is internally redirected by `try_files` to `/frontoffice/index.html` or `/backoffice/index.html`; a location-level `types` override there dropped `text/html`, so `nosniff` blocked MIME sniffing. | Verify with `curl.exe --ssl-no-revoke -D - -o NUL https://app.smartcare.local/` and check for `Content-Type: text/html`; use the complete global MIME table from ADR-0010 and keep `X-Content-Type-Options: nosniff`. |
| B6 | `service workers never cache 404...` test fails after adding a maintenance worker | Cache API usage in `sw-kill.js` was treated as production frontend storage. | Exempt only `sw-kill.js` in that assertion; keep all other frontend files cache-free. |
| B6 live | `POST /api/auth/logout` returns 403 `csrf_invalid` | `X-CSRF-Token` header missing or token does not match the session. | Re-login, read `csrfToken` from `/api/auth/login` or `/api/session`, and send it as `X-CSRF-Token`; do not skip CSRF. |
| B6 live | HTTPS login cookie lacks `Secure` | Legacy `smartcare-wildfly` still running without `SMARTCARE_SESSION_SECURE=true`. | Task 3 recreates the container from the derived HTTPS image; do not mark live cookie checks verified before that. |
| B6 live | Login returns 429 `too_many_attempts` | Five failures in 15 minutes for the email or IP. | Wait 15 minutes, or clear `login_attempts` in MongoDB with `mongosh "mongodb://localhost:27017/smartcare" --quiet --eval 'db.login_attempts.deleteMany({})'`; see backend live verification guide. |
| B6 live | Patient session accepted on staff host | No backend staff-only route exists; portal segregation is currently client-side only. | Record as GAP for login completion; do not change application logic without live bug approval. |
| B5 live | `Container 'smartcare-wildfly' does not exist` | The exact original `docker run` flags are not versioned. | Restore the source container first; `recreate-wildfly.ps1` deliberately refuses to invent flags. |
| B5 live | WAR missing after WildFly recreation | Deployments lived only in the old container layer. | Use `scripts/recreate-wildfly.ps1`; it exports deployments to `smartcare-wildfly-deployments` when no mount covers that path. |
| B5 live | Restart policy remains `no` | Container was recreated without `-Force` or with another command. | Re-run `PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\recreate-wildfly.ps1 -Force` and expect `PASS restart policy :: unless-stopped`. |
| B6 audit | `git check-ignore -v certs/...` returns no output | `.gitignore` rule for `certs/*` removed or wrong working directory. | Restore `.gitignore:51:certs/*` and run from repo root; never commit the cert/key files. |
| B6 audit | Windows user-directory prefix found in tracked docs | A prompt or evidence file uses a raw clone path. | Replace user/path with `<USER>`/`<REPO>`; see security hygiene audit. Author names in credits are intentional and are not path leakage. |
| B6 audit | WildFly or MongoDB listens on `0.0.0.0` | Legacy lab setup exposes more than a hardened deployment should. | Record as issue-ready gap; do not change bindings without Phase C/production approval because nginx uses `host.docker.internal:8080`. |

<!-- Placeholder for later phases: TLS handshake failure, HSTS mismatch, SW not controlling page, install prompt missing, phone CA not trusted, .local DNS not resolving. -->
