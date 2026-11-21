# 14 — Consolidated troubleshooting

Living document. Add a row for every realistic problem found in a step doc; keep the step doc as the detailed source.

| Step | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| A (audit) | `mvn clean verify` fails with `MongoTimeoutException: localhost:27017`. | `smartcare-mongodb` container stopped. | `docker start smartcare-mongodb`; rerun with `JAVA_HOME` set to JDK 25. |
| A (audit) | Maven uses Java 17 although `java -version` is 25. | `JAVA_HOME` points to `jdk17.0.18_9`. | `$env:JAVA_HOME='C:\Program Files\Amazon Corretto\jdk25.0.5_0'`. |
| A (audit) | A test file contains `192.168.1.4`. | Node test fixture, not runtime frontend code. | No action in Phase A; re-check acceptance criterion in Phase C. |

<!-- Placeholder for later phases: TLS handshake failure, HSTS mismatch, cookie not Secure, CSRF 403, SW not controlling page, install prompt missing, phone CA not trusted, .local DNS not resolving. -->
