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
| B2 | `Local CA not trusted yet` | `mkcert -install` ran without project `CAROOT`. | Set `$env:CAROOT=(Resolve-Path .\certs\ca).Path`, run `mkcert -install`, then `scripts/gen-certs.ps1`. |
| B2 | `... is NOT ignored by git` | `.gitignore` pattern missing or wrong working directory. | Restore patterns in `certs/README.md`; run scripts from repo root. |
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

<!-- Placeholder for later phases: TLS handshake failure, HSTS mismatch, cookie not Secure, CSRF 403, SW not controlling page, install prompt missing, phone CA not trusted, .local DNS not resolving. -->
