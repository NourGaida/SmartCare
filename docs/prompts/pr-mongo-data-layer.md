# PR: MongoDB data layer — configurable timeout, CI integration, recovery/demo scripts

## What

This change hardens the MongoDB data layer and its verification:

- `MongoProvider` now applies a configurable server-selection timeout through
  `MongoClientSettings`. The value comes from `MONGODB_SERVER_SELECTION_TIMEOUT_MS`,
  defaults to `2000` ms, and falls back to the default when the value is missing,
  malformed, or not positive.
- `DatabaseHealthSource` keeps the same `/smartcare/api/health/database` contract but
  separates the status decision (`check()`) from the JAX-RS `Response` construction,
  so the 503 behaviour can be unit-tested without a JAX-RS runtime.
- The Java CI job now starts a `mongo:8` service on port `27017`, exports
  `MONGODB_URI=mongodb://localhost:27017`, and fails when Surefire reports any skipped
  test.
- `.gitignore` now also ignores `node_modules/`.
- Added `scripts/check-recovery.ps1` (HTTP 503 → restart → HTTP 200 without redeploy)
  and `scripts/demo-duplicate.js` (mongosh demo of `uq_device_boot_sequence`).
- Updated `ATTRIBUTION.md` with the real dependency list, the OpenCode prompt entry,
  and the `TO_FILL_BY_HUMAN` share placeholder. The prompt is stored verbatim in
  `docs/prompts/2026-11-14-close-mongo-pr.md`.

## Why

- The driver default server-selection timeout is 30 s. Without an override,
  `/health/database` can hang for 30 s while MongoDB is down.
- CI was skipping the MongoDB integration tests because no database was available.
  A skipped test looks green while proving nothing.
- The recovery and duplicate scripts give a repeatable oral-demo path without adding
  test dependencies or secrets.

## Evidence

Environment: Windows 11, PowerShell 5.1, `JAVA_HOME` = Corretto 25.0.5, Maven 3.10.0,
MongoDB `mongo:8.0` container `smartcare-mongodb` on `localhost:27017`.

### Maven verification

Command: `mvn -f C:\Users\SINORFI\Desktop\SmartCare\pom.xml clean verify`

```text
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0 -- in com.smartcare.api.DatabaseHealthSourceTest
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0 -- in com.smartcare.persistence.MeasurementRepositoryTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0 -- in com.smartcare.persistence.MeasurementTest
[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0 -- in com.smartcare.persistence.MongoProviderTest
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0 -- in com.smartcare.persistence.SchemaInitializerTest
[INFO] Tests run: 24, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

`DatabaseHealthSourceTest` uses the unreachable URI `mongodb://127.0.0.1:1` and the
configured 2000 ms timeout. It completed in `2.702 s`, not 30 s, and asserted
`status = 503` with body `{"status":"error"}`.

### MongoDB indexes

Command: `mongosh smartcare --eval "printjson(db.measurements.getIndexes())"`

```json
[
  { "v": 2, "key": { "_id": 1 }, "name": "_id_" },
  {
    "v": 2,
    "key": { "deviceId": 1, "bootId": 1, "sequence": 1 },
    "name": "uq_device_boot_sequence",
    "unique": true
  },
  { "v": 2, "key": { "patientId": 1, "acquiredAt": -1 }, "name": "ix_patient_time" }
]
```

### Deployment and health endpoints

Deployment used jboss-cli only, never a manual copy into `standalone\deployments`:

```powershell
$wildfly = "<path-to-wildfly-42.0.0.Final>"
& "$wildfly\bin\jboss-cli.bat" --controller=127.0.0.1:10090 --connect `
  --command="deploy C:\Users\SINORFI\Desktop\SmartCare\target\smartcare.war --force"
```

Local WildFly used `-Djboss.socket.binding.port-offset=100` because port 8080 is
already occupied by another process; HTTP is on 8180 and management on 10090.
The server log confirmed the deployed client settings:

```text
clusterSettings={hosts=[localhost:27017], ..., serverSelectionTimeout='2000 ms', ...}
WFLYSRV0016: Replaced deployment "smartcare.war" with deployment "smartcare.war"
```

```text
GET http://localhost:8180/smartcare/api/health          -> 200 {"status":"ok"}
GET http://localhost:8180/smartcare/api/health/database -> 200 {"status":"ok"}
```

The 503/recovery demonstration is scripted in `scripts/check-recovery.ps1`. It was
not run here by instruction; it stops `smartcare-mongodb`, expects 503 within about
2 s, starts it again, waits 5 s, and expects 200 without redeploy.

### Ignore check

`git ls-files` reported **0 tracked files** matching `target/`, `.env`, `.env.*`,
`.venv-simulator/`, `*.log`, or `node_modules/`. No tracked file needed deletion.

## Decisions

- **Duplicate key unchanged:** `(deviceId, bootId, sequence)` in unique index
  `uq_device_boot_sequence`. The repository still converts only
  `ErrorCategory.DUPLICATE_KEY` into `SaveResult.DUPLICATE`; every other write error
  is rethrown.
- **`@ApplicationScoped` + protected no-arg constructors:** CDI needs a no-arg
  constructor to build client proxies. The protected constructor is never used for
  real work; the injected/public constructor supplies the real dependencies.
  `MongoProvider` keeps a no-arg CDI constructor and adds a public test seam that
  connects to an explicit URI with an explicit timeout.
- **Validator with `anyOf` / `not`:** `quality = "good"` requires integer
  `heartRate` and `spo2`; any other quality requires a non-empty `reason` and is
  forbidden from also being `"good"` by the `not` clause. This matches the
  `Measurement` record invariants.
- **Fast health failure:** the timeout is applied in `MongoClientSettings`
  (`applyToClusterSettings(...serverSelectionTimeout(...))`), so it overrides the
  driver's 30 s default for every operation on the client, including the health ping.
- **Testable health logic:** `check()` returns a small `DatabaseHealth(status, body)`
  record; `health()` only wraps it in a JAX-RS `Response`. The timeout test therefore
  needs neither MongoDB nor a JAX-RS runtime delegate.
- **No A/C code touched:** frontend, simulator, gateway, and the CI frontend/simulator
  jobs are unchanged.

## How to run

Prerequisites: JDK 25 (Corretto 25), Maven, Docker, MongoDB container, WildFly 42.

```powershell
# 1. MongoDB for integration tests
docker start smartcare-mongodb
# or: docker run --name smartcare-mongodb -p 27017:27017 -d mongo:8

# 2. Build and test
$env:JAVA_HOME = 'C:\Program Files\Amazon Corretto\jdk25.0.5_0'
mvn -f C:\Users\SINORFI\Desktop\SmartCare\pom.xml clean verify

# 3. Optional: custom health timeout
$env:MONGODB_SERVER_SELECTION_TIMEOUT_MS = '2000'

# 4. Deploy with jboss-cli only (never copy the WAR into standalone\deployments)
$wildfly = '<path-to-wildfly-42.0.0.Final>'
& "$wildfly\bin\jboss-cli.bat" --connect `
  --command="deploy C:\Users\SINORFI\Desktop\SmartCare\target\smartcare.war --force"

# 5. Check endpoints
Invoke-WebRequest http://localhost:8080/smartcare/api/health -UseBasicParsing
Invoke-WebRequest http://localhost:8080/smartcare/api/health/database -UseBasicParsing

# 6. Recovery demo (not executed in this PR)
.\scripts\check-recovery.ps1

# 7. Duplicate demo (not executed in this PR)
mongosh "mongodb://localhost:27017" scripts/demo-duplicate.js
```

## Checklist

- [x] `MONGODB_SERVER_SELECTION_TIMEOUT_MS` defaults to 2000 and is applied through
      `MongoClientSettings`
- [x] Timeout test uses an unreachable URI, needs no MongoDB, and asserts 503 in about 2 s
- [x] MongoDB integration tests still skip cleanly when no server is reachable
- [x] CI Java job runs `mongo:8` and fails on skipped Surefire tests
- [x] Frontend and simulator CI jobs untouched
- [x] `target/`, `.env`, `.env.*`, `.venv-simulator`, `*.log`, `node_modules/` ignored
- [x] No ignored path was already tracked
- [x] Recovery and duplicate scripts use PowerShell/mongosh and contain no secrets
- [x] `ATTRIBUTION.md` libraries match `pom.xml` and `requirements.txt`
- [x] Share placeholder is `TO_FILL_BY_HUMAN`; no percentage invented
- [x] Full verification: 24 tests, 0 failures, 0 errors, 0 skipped
- [x] `uq_device_boot_sequence` listed by `mongosh`
- [x] Deployed with jboss-cli only
- [x] Commits are conventional and split by logical change
