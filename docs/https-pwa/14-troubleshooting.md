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

<!-- Placeholder for later phases: TLS handshake failure, HSTS mismatch, cookie not Secure, CSRF 403, SW not controlling page, install prompt missing, phone CA not trusted, .local DNS not resolving. -->
