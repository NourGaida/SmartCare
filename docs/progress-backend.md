# Backend progress

## Baseline (feature/device-ownership)
- JDK/Maven: forced to Java 25 (Corretto 25.0.5), Maven 3.10.0 reports Java 25.
- Services: smartcare-mongodb and smartcare-mosquitto running (docker ps confirmed). docker compose ... up -d reported missing external volume smartcare_nodered_data (Node-RED not started); MongoDB/Mosquitto reachable.
- Baseline mvn -f middleware/pom.xml clean verify: **BUILD SUCCESS**. Tests run: 53 (core), 0 (iam), 2 (api), Failures: 0, Errors: 0, Skipped: 0.

## T1 — feature/device-ownership
- Branch: eature/device-ownership (stack base for next tasks). Commits include ownership resolution + fixes.
- Added SchemaInitializerTest#uqDeviceOpenOwnershipAllowsOnlyOneOpenRecord: two open records with alidTo:null fail (duplicate key), two open records with alidTo missing fail, one closed + one open for same device succeeds. Partial unique index uq_device_open_ownership (deviceId, partialFilterExpression {validTo:null}) verified working on local MongoDB.
- Made NoopOwnershipResolver a CDI @Alternative so production bean resolution uses DeviceOwnershipResolver (not noop).
- mvn -f middleware/pom.xml clean verify (JDK 25): **BUILD SUCCESS** — Tests run: 54 (core), 0 (iam), 2 (api), Failures: 0, Errors: 0, Skipped: 0.
- Deploy/curl verification: **not run** — WildFly 42 / jboss-cli.bat not found on this machine (where jboss-cli.bat none; no wildfly* dirs found under common locations searched). No endpoint added in T1; running-app resolver choice confirmed by CDI wiring (@Alternative noop, @ApplicationScoped DeviceOwnershipResolver).
