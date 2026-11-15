# PR: MQTT receiver — validated-topic ingestion, health counters and CI broker

## What

This change adds the Phase 2 backend ingestion path for validated MQTT messages:

- `MqttReceiver` subscribes to `smartcare/v1/validated/#` with Eclipse Paho,
  reconnects after a connection loss, resubscribes, and does not block WAR
  deployment when the broker is unavailable.
- `MeasurementMessageHandler` independently revalidates each payload before
  storing it through the existing `MeasurementRepository`.
- The handler rejects malformed, out-of-range, stale/unsynced, topic-mismatched
  and storage-failed messages with stable reasons.
- `IngestionCounters` tracks `received`, `saved`, `duplicate`, `rejected`,
  `storeFailed`, `rejectedByReason`, broker connection state and the last
  rejection/message time.
- `GET /smartcare/api/health/ingestion` reports the counters and returns `503`
  when MongoDB or the schema is not ready.
- Added unit, integration and API tests, a direct MQTT publishing helper, a CI
  Mosquitto service step, and documentation/attribution updates.

## Why

- The validation gateway is implemented, but the backend must not trust it.
  A malformed or replayed message reaching the validated topic must not bypass
  backend invariants.
- QoS 1 can redeliver messages. The MongoDB unique index remains the only
  duplicate authority; the gateway's in-memory filter is not trusted.
- A missing broker must not prevent the WAR from deploying.
- Operators need visibility into whether the receiver is connected and why
  messages are being rejected.
- Local and CI integration tests must use a real broker, not a mock that could
  hide Paho lifecycle or topic-filter mistakes.

## Evidence

Environment: Windows 11, PowerShell 5.1, `JAVA_HOME` = Corretto 25.0.5,
Maven 3.10.0, MongoDB `mongo:8.0` container `smartcare-mongodb` on
`localhost:27017`, Mosquitto container `smartcare-mosquitto` on
`localhost:1883`, WildFly 42.0.0.Final on `localhost:8080` / `localhost:9990`.

### Maven verification

Command: `mvn -f middleware/pom.xml clean verify`

```text
[INFO] Tests run: 50, Failures: 0, Errors: 0, Skipped: 0
[INFO] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

The core run included `MqttReceiverIntegrationTest`, which was not skipped
because both MongoDB and Mosquitto were reachable. It verified:

- a valid message is stored once;
- the same `(deviceId, bootId, sequence)` is counted as a duplicate and is not
  stored twice;
- a broker takeover drops the receiver connection;
- the receiver reconnects, resubscribes and stores a later sequence.

`MqttReceiverDownTest` exercised broker-down startup against
`tcp://127.0.0.1:1`; it asserted that the receiver reports disconnected and does
not throw out of startup. `IngestionHealthSourceTest` asserted that an
unreachable MongoDB returns `503` with counters within the configured timeout.

The GitHub Actions workflow has not been observed on a remote runner in this
session; its Mosquitto startup step mirrors the local broker setup.

### Deployment and health endpoints

Deployment used `jboss-cli` only; no WAR was copied into
`standalone\deployments`:

```powershell
$wildfly = 'C:\Users\SINORFI\Downloads\wildfly-42.0.0.Final\wildfly-42.0.0.Final'
& "$wildfly\bin\jboss-cli.bat" --connect `
  --command="deploy C:\Users\SINORFI\Desktop\SmartCare\middleware\api\target\smartcare.war --force"
```

After deployment:

```text
GET http://localhost:8080/smartcare/api/health
-> 200 {"status":"ok"}

GET http://localhost:8080/smartcare/api/health/database
-> 200 {"status":"ok"}

GET http://localhost:8080/smartcare/api/health/ingestion
-> 200 {"status":"ok","connected":true,"received":0,"saved":0,"duplicate":0,
        "rejected":0,"storeFailed":0,"rejectedByReason":{},
        "lastRejectionReason":null,"lastMessageAt":null}
```

A direct validated-topic publish used `scripts/publish-test-message.ps1`:

```powershell
.\scripts\publish-test-message.ps1 `
  -DeviceId deploy-check-01 `
  -BootId 4aadad14-f5c2-482c-a100-4bc7c580b1cb `
  -Sequence 1
```

Result:

```json
{"status":"ok","connected":true,"received":1,"saved":1,"duplicate":0,
 "rejected":0,"storeFailed":0,"rejectedByReason":{},
 "lastRejectionReason":null,"lastMessageAt":"2026-11-15T00:28:06.698108800Z"}
```

Publishing the same identity again, then an unsynced message with sequence 2:

```json
{"status":"ok","connected":true,"received":3,"saved":1,"duplicate":1,
 "rejected":1,"storeFailed":0,
 "rejectedByReason":{"clock_not_synced":1},
 "lastRejectionReason":"clock_not_synced",
 "lastMessageAt":"2026-11-15T00:28:15.704557600Z"}
```

MongoDB contained exactly one document for that device:

```text
docker exec smartcare-mongodb mongosh --quiet --eval \
  "db.getSiblingDB('smartcare').measurements.countDocuments({deviceId:'deploy-check-01'})"
1
```

This is a direct validated-topic check, not a Node-RED end-to-end test.
Node-RED is not available in this environment or in CI, so no gateway-to-receiver
end-to-end claim is made.

## Decisions

- **Independent backend validation:** the receiver revalidates size, JSON shape,
  schema version, identifiers, timestamp, quality, ranges, clock status, source
  and topic. The gateway remains a filter, not a trust boundary.
- **Topic binding:** the topic must equal the configured prefix plus exactly one
  non-empty segment, and that segment must equal the payload `deviceId`.
  Otherwise the message is rejected as `topic_mismatch`.
- **Identifiers:** `deviceId` and `bootId` must be nonblank strings. `sequence`
  must be an integer `>= 1`; `0` is rejected because `Measurement` and the Mongo
  validator require a positive sequence. The unique index remains
  `(deviceId, bootId, sequence)`.
- **Timestamps:** `acquiredAtUtc` is parsed as an ISO-8601 value with an offset or
  `Z`, converted to UTC, and stored at the millisecond precision supported by the
  existing measurement model.
- **Clock policy:** only `clockStatus` values in
  `MQTT_ACCEPTED_CLOCK_STATUS` are accepted. The default is `synced`;
  comma-separated values are case-sensitive.
- **Quality and ranges:** good quality requires integral `heartRate` and `spo2`
  values, with HR `1..300` and SpO2 `0..100`. Invalid quality requires both
  measurements to be JSON `null` and a nonblank `reason`. Floats are rejected,
  never truncated.
- **Source and ownership:** `source` must be nonblank and is stored unchanged.
  `patientId` and extra fields are ignored and never stored.
- **Counters:** `received = saved + duplicate + rejected`; `storeFailed` is a
  subset of `rejected` and appears in `rejectedByReason` as `store_failed`.
- **Health semantics:** `/health/ingestion` returns `200` only when MongoDB and
  the schema are ready, and `503` otherwise. The body still reports the
  broker `connected` state and counters.
- **Paho lifecycle:** one asynchronous client and one single-thread scheduler;
  automatic reconnect is disabled so the receiver controls retry, subscription
  and connection state explicitly.
- **No schema/validator changes:** no collection validator, index or route outside
  the new health endpoint was modified. No payload is logged above DEBUG; the
  repository duplicate log contains only `deviceId` and `sequence`.

## How to run

Prerequisites: JDK 25, Maven 3.10+, Docker, MongoDB, Mosquitto, WildFly 42.

```powershell
# 1. Start local dependencies
docker start smartcare-mongodb
docker start smartcare-mosquitto

# 2. Build and run all tests
$env:JAVA_HOME = 'C:\Program Files\Amazon Corretto\jdk25.0.5_0'
mvn -f middleware/pom.xml clean verify

# 3. Deploy with jboss-cli only
$wildfly = '<path-to-wildfly-42.0.0.Final>'
& "$wildfly\bin\jboss-cli.bat" --connect `
  --command="deploy C:\Users\SINORFI\Desktop\SmartCare\middleware\api\target\smartcare.war --force"

# 4. Check health
Invoke-WebRequest http://localhost:8080/smartcare/api/health -UseBasicParsing
Invoke-WebRequest http://localhost:8080/smartcare/api/health/database -UseBasicParsing
Invoke-WebRequest http://localhost:8080/smartcare/api/health/ingestion -UseBasicParsing

# 5. Publish directly to the validated topic
.\scripts\publish-test-message.ps1 -DeviceId sc-test -Sequence 1
```

Reuse the same `-BootId` and `-Sequence` to exercise deduplication. Use
`-Quality invalid -Reason no_finger` for an invalid-quality message.

## Checklist

- [x] Receiver subscribes to the configured validated topic and requires the
      topic segment to match `deviceId`
- [x] Backend independently validates schema version, identifiers, timestamp,
      quality, ranges, clock status and source
- [x] Duplicate handling still relies on `uq_device_boot_sequence`
- [x] Broker-down startup does not fail deployment
- [x] Reconnect and resubscribe are covered by a real-broker integration test
- [x] Counters satisfy `received = saved + duplicate + rejected`
- [x] `/smartcare/api/health/ingestion` reports counters and returns `503`
      when MongoDB/schema are not ready
- [x] Full local verification: 52 tests, 0 failures, 0 errors, 0 skipped
- [x] Deployment used `jboss-cli` only
- [x] Direct validated-topic publish stored one measurement
- [x] Duplicate publish was counted and not stored twice
- [x] Unsynced message was rejected as `clock_not_synced`
- [x] CI starts Mosquitto and keeps the skipped-test gate
- [x] Documentation, attribution, prompt record and publishing helper updated
- [x] No files under `iot/` or `frontends/` were modified
- [x] Node-RED end-to-end testing is not claimed
