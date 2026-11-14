# MQTT ingestion audit — Phase 1

Read-only audit for the MQTT receiver work on branch `feature/mqtt-receiver`.

- Date: 2026-11-14
- Scope: simulator contract, Node-RED validation flow, broker configuration, and the existing MongoDB persistence layer.
- Out of scope: Phase 2 implementation, ESP32 firmware, Node-RED changes, broker changes, schema changes, test-code changes.
- Runtime check: local Mosquitto was started from `iot/broker/docker-compose.yml`; the simulator was run against it. Node-RED was inspected from `flows.json`, not executed (the Node-RED image is not present locally and the compose file requires an external `smartcare_nodered_data` volume).

Legend: **CONFIRMED** = verified by source or captured output; **INFERRED** = follows from framework/runtime behaviour but was not executed end-to-end; **UNKNOWN** = not established by the repository or runtime check.

## 1. Payload contract

### 1.1 Raw contract observed from the simulator

Source: `iot/docs/message-contract.md:16-53`, `iot/simulator/simulator.py:99-116`, live capture below.

| Field | Observed type/meaning | Simulator guarantees | Gateway validates? |
| --- | --- | --- | --- |
| `schemaVersion` | Integer `1` | Always `1` | Yes, must equal `1` (`flows.json:76`) |
| `deviceId` | String, default `sc-001` | Nonempty single topic segment enforced by CLI (`simulator.py:196-197`) | Only nonempty string; topic must match |
| `bootId` | UUID string | New UUID per simulator launch; retained across `disconnect` | Only nonempty string |
| `sequence` | Integer >= 1 | Starts at 1 per launch; increments per logical slot, including missing slots | Safe integer >= 1 |
| `acquiredAtUtc` | ISO 8601 string with `+00:00` | `datetime.now(timezone.utc).isoformat()` | String accepted by JavaScript `Date.parse` |
| `heartRate` | Integer bpm or `null` | Normal 72–78; invalid scenario uses `null` | Number, finite, `0 < value <= 300` when good |
| `spo2` | Integer percent or `null` | Normal 97–99; invalid scenario uses `null` | Number, finite, `0 <= value <= 100` when good |
| `quality` | `good` or `invalid` | `good` for normal; `invalid` for null readings | Must be exactly `good` or `invalid` |
| `reason` | `null` or string | `null` for good; `no_finger` for invalid | For invalid, must be a truthy string |
| `clockStatus` | String | Always `synced` in the simulator | **Not validated at all** |
| `source` | String | Always `simulated` | **Not validated at all** |
| `patientId` | Absent | Not emitted | Not checked; unknown fields pass through |

Status:

- Raw topic, field set, QoS, and no-retain behaviour: **CONFIRMED**.
- Simulator always emits all fields above: **CONFIRMED** (`iot/simulator/tests/test_simulator.py:174-192`).
- Gateway validates only the fields listed above: **CONFIRMED** (`flows.json:76`).
- Gateway does not validate `clockStatus`, `source`, or reject unknown fields such as `patientId`: **CONFIRMED** by the function source.

Captured normal message (`audit-normal`, `normal` scenario):

```json
{
  "schemaVersion": 1,
  "deviceId": "audit-normal",
  "bootId": "c40cbc5d-e70d-459d-be57-83164f623d5d",
  "sequence": 1,
  "acquiredAtUtc": "2026-11-14T15:03:19.319129+00:00",
  "heartRate": 77,
  "spo2": 97,
  "quality": "good",
  "reason": null,
  "clockStatus": "synced",
  "source": "simulated"
}
```

### 1.2 Validated output

The gateway subscribes to `smartcare/v1/raw/#` (`flows.json:21-38`) and passes accepted objects to `Set Validated Topic`, which changes only `msg.topic` to:

```text
smartcare/v1/validated/{payload.deviceId}
```

Evidence: `iot/gateway/flows/flows.json:117-125`.

No field is added, removed, or normalised by the flow. The MQTT output publishes the same object with QoS 1 and retain false (`flows.json:169-183`). Therefore the expected validated payload is the original JSON object, reserialised by Node-RED.

Status:

- Validated topic format and no field mutation in the flow: **CONFIRMED** from source.
- Exact validated payload bytes: **INFERRED** because Node-RED was not executed; reserialisation can change whitespace/key order, not values.
- Node-RED parses the raw JSON before the function: **INFERRED** from `datatype: "auto-detect"` (`flows.json:26`), the gateway README (`iot/gateway/README.md:16-19`), and the function’s object-based checks. The separate `json` node (`flows.json:41-53`) is orphaned (`wires: []`) and plays no role.

Rejected output is a new object, not the original payload:

```json
{
  "deviceId": "<payload.deviceId or null>",
  "reason": "<reason>",
  "receivedAtUtc": "<gateway time>",
  "originalMessage": "<original object>"
}
```

Evidence: `flows.json:76` and `iot/gateway/README.md:158-180`.

## 2. `bootId` and `sequence`

| Behaviour | Evidence | Status |
| --- | --- | --- |
| `bootId` is a UUID generated when the simulator process starts | `simulator.py:88-94` | CONFIRMED |
| `bootId` is retained across MQTT reconnect in `disconnect` | `simulator.py:159-165`; `test_simulator.py:132-150` | CONFIRMED |
| Two launches produce different `bootId` values | live capture: `c40cbc5d-...` vs `b1bfaec4-...` | CONFIRMED |
| `sequence` starts at 1 and increments once per logical slot | `simulator.py:94,100-101,127-133`; `test_simulator.py:75-84` | CONFIRMED |
| Missing slots increment `sequence` without publishing | `simulator.py:146-151`; live capture: 1–5 then 12–21 | CONFIRMED |
| `duplicates` publishes the same serialised JSON twice, including key and timestamp | `simulator.py:153-157`; `test_simulator.py:124-130`; live capture | CONFIRMED |
| Backend logical key is `(deviceId, bootId, sequence)` | `SchemaInitializer.java:35-39`; `README.md:226` | CONFIRMED |
| Backend duplicate enforcement is a unique Mongo index | `SchemaInitializer.java:167-172` | CONFIRMED |
| Gateway duplicate filter is in-memory per `deviceId:bootId` and rejects `sequence <= lastSequence` | `flows.json:76` | CONFIRMED |
| Gateway filter does not reject sequence gaps | same function: only `<= lastSequence` is rejected | CONFIRMED |
| Gateway filter does **not** survive a Node-RED restart | Not persisted; `flow.get`/`flow.set` only | CONFIRMED by source; runtime persistence not tested |

Captured missing transition:

```text
sequence 5  acquiredAtUtc 2026-11-14T15:04:02.045652+00:00
sequence 12 acquiredAtUtc 2026-11-14T15:04:09.045251+00:00
```

The sequence jumps by 7 and the timestamps differ by 7 seconds, matching the documented `missing` scenario.

Operational consequences:

- The gateway can reject a late or retransmitted message that is older than the last sequence it saw, even if it is not a duplicate of a stored measurement. The backend unique index remains the authoritative duplicate guard.
- The gateway updates its in-memory `lastSequence` before the MQTT output publishes. If the output publish fails, later messages for that `deviceId:bootId` may be rejected as old.
- Duplicates that arrive after a Node-RED restart are not filtered by the gateway; the backend must still return `DUPLICATE` for them.

## 3. Topics, QoS, retain, client identity, auth, TLS

| Item | Evidence | Status |
| --- | --- | --- |
| Simulator publishes only `smartcare/v1/raw/{deviceId}` | `simulator.py:96,115-116`; `iot/docs/message-contract.md:9-14` | CONFIRMED |
| Simulator QoS 1, no retain | `simulator.py:70-77`; contract line 11 | CONFIRMED |
| Simulator waits for MQTT acknowledgement, not backend processing | `simulator.py:74-76`; `iot/simulator/README.md:85-86` | CONFIRMED |
| Simulator client ID includes PID and UUID | `simulator.py:40-43` | CONFIRMED |
| Simulator does not configure TLS or credentials | `simulator.py:40-45,56` | CONFIRMED |
| Broker listens on 1883, anonymous, persistence on, no TLS/user/password | `iot/broker/mosquitto.conf:1-6` | CONFIRMED |
| Compose exposes broker only on host loopback `127.0.0.1:1883` | `iot/broker/docker-compose.yml:7-8` | CONFIRMED |
| Gateway subscribes to `smartcare/v1/raw/#`, QoS 1 | `flows.json:21-38` | CONFIRMED |
| Gateway MQTT broker node uses MQTT v3.1.1 (`protocolVersion: 4`), no TLS, clean session, empty client ID | `flows.json:203-232` | CONFIRMED |
| Gateway outputs QoS 1, retain false | `flows.json:169-201` | CONFIRMED |
| Gateway validates and republishes to `smartcare/v1/validated/{deviceId}` and `smartcare/v1/rejected/{deviceId}` | `flows.json:117-165`; `iot/gateway/README.md:125-134` | CONFIRMED |

Important observations:

- `cleansession: true` on the gateway broker node means the Node-RED input subscription is not persistent. Messages published while Node-RED is offline are not queued for that clean session, even though the broker has persistence enabled. Broker persistence does not by itself create an offline queue for a clean-session client. **CONFIRMED from configuration; exact delivery loss depends on broker/client state.**
- The planned backend subscription is `smartcare/v1/validated/+` (one topic level). The gateway does not enforce that `deviceId` is a single MQTT topic segment. A payload whose `deviceId` contains `/` can still pass the gateway if the raw topic matches exactly, producing `smartcare/v1/validated/a/b`, which a `+` subscription will not receive. The simulator CLI does forbid `/`, `+`, `#`, and NUL (`simulator.py:196-197`), but the gateway does not. This is a contract gap to confirm with C.
- The gateway uses an empty client ID; Node-RED generates one. The simulator client ID is deliberately distinct from `deviceId` and `bootId`.
- No authentication or TLS is configured anywhere in the local path. This is documented as local-development-only (`iot/gateway/README.md:86`).

## 4. `acquiredAtUtc` and `clockStatus`

Confirmed facts:

- The simulator sets `acquiredAtUtc` to the current UTC time in ISO 8601 with `+00:00` (`simulator.py:106`).
- The simulator always sets `clockStatus` to `"synced"` (`simulator.py:111`; contract lines 42, 47).
- The simulator emits microseconds in the timestamp. The backend `Measurement` constructor truncates both timestamps to milliseconds (`Measurement.java:50-51`).
- The gateway requires `acquiredAtUtc` to be a string accepted by JavaScript `Date.parse` and rejects missing, non-string, or non-parseable values as `invalid_timestamp` (`flows.json:76`).
- The MongoDB validator requires `acquiredAt` to be a BSON date and `clockStatus` to be a string (`SchemaInitializer.java:137,143,160-164`).
- The backend `Measurement` record requires non-null `acquiredAt` and nonblank `clockStatus` (`Measurement.java:31-42`).
- The backend does not restrict `clockStatus` to `"synced"`; any nonblank string is accepted by the record and by the Mongo validator.

Timestamp grammar mismatch:

- JavaScript `Date.parse` accepts forms that Java `Instant.parse` does not. Verified locally with Node 22 and Java 25:

```text
2026-11-14T15:03:19.319129+00:00 -> accepted by both
2026-11-08T20:00:00Z              -> accepted by both
2026-11-08T20:00:00+01:00         -> accepted by both
2026-11-08                        -> Date.parse accepts; Instant.parse rejects
2026-11-08T20:00:00.123           -> Date.parse accepts (local time); Instant.parse rejects
```

Therefore a payload accepted by the gateway as `validated` may be unparseable as a Java `Instant` unless the receiver deliberately implements a compatible parser or rejects it with a clear reason.

Pre-sync status:

- Current repository evidence only shows `clockStatus="synced"` and a valid timestamp. No device firmware or pre-sync sample is present.
- If a device cannot provide `acquiredAtUtc` before clock sync, the current gateway rejects the message as `invalid_timestamp`; it never reaches `validated`. The backend schema also cannot store a missing `acquiredAt` without a schema change.
- If a device provides a fallback timestamp but `clockStatus="unsynced"` or similar, the gateway accepts it and the backend could store it because `clockStatus` only needs to be nonblank. No schema change would be needed for that case.
- Whether a device can omit `acquiredAtUtc` before clock sync remains **UNKNOWN**; if it can, the current gateway rejects those messages before the backend.
- **Decision 2026-11-14: reject until synced.** Phase 2 will accept a measurement only when `acquiredAtUtc` is valid and `clockStatus` indicates the clock is synced. Missing/invalid timestamps and pre-sync measurements are rejected. No schema change is required. Confirm with C that `"synced"` is the expected synced value.

## 5. Payload-to-`Measurement` mapping and rejection differences

### 5.1 Intended mapping

| Payload field | Backend field | Notes |
| --- | --- | --- |
| `deviceId` | `deviceId` | Must be nonblank; also compare with topic |
| `bootId` | `bootId` | Must be nonblank |
| `sequence` | `sequence` | `long`, must be >= 1 |
| `acquiredAtUtc` | `acquiredAt` | Parse to `Instant`; stored at millisecond precision |
| — | `receivedAt` | Set by backend at ingestion; not `receivedAtUtc` from rejected payload |
| `heartRate` | `heartRate` | `Integer` or null; Mongo accepts int/null only |
| `spo2` | `spo2` | `Integer` or null; Mongo accepts int/null only |
| `quality` | `quality` | Backend does not enforce the good/invalid enum |
| `reason` | `reason` | Required nonblank only when quality is not `good` |
| `clockStatus` | `clockStatus` | Required nonblank; no enum |
| `source` | `source` | Optional string/null; no enum |
| — | `patientId` | Must remain unset/null; ownership belongs to the backend |
| `schemaVersion` | `schemaVersion` | `Integer`; Mongo accepts int/null; gateway requires exactly 1 |

Evidence: `Measurement.java:6-52`, `MeasurementMapper.java:12-43`, `SchemaInitializer.java:132-165`.

Status: **CONFIRMED** for the field mapping and existing record/schema constraints.

### 5.2 Gateway/backend mismatches to handle in the receiver

The gateway’s `validated` topic is therefore not a guarantee that the payload satisfies the backend model. The receiver must validate independently and return `REJECTED` rather than letting `Measurement`, JSON-P, or Mongo throw an unclassified error.

| Case | Gateway | Backend today | Recommended receiver action |
| --- | --- | --- | --- |
| Missing/blank `clockStatus` | Passes (not checked) | `Measurement` rejects blank; Mongo requires string | Reject with clear reason |
| Missing/non-string `source` | Passes | `Measurement` allows null; Mongo allows string/null | Decide: ignore/normalise or reject non-string |
| `schemaVersion` other than 1 | Rejects | Record/Mongo do not enforce 1 | Enforce 1 in handler |
| `quality` other than `good`/`invalid` | Rejects | Record/Mongo accept any nonblank non-good value with reason | Enforce `good`/`invalid` in handler |
| Good quality with out-of-range values | Rejects outside 0–300 bpm / 0–100 % | No range check in record/Mongo | Enforce same technical ranges in handler |
| Float `heartRate` or `spo2` | Passes (`typeof number`) | `Integer` / Mongo int; truncation risk if converted naively | Reject non-integral numbers |
| `deviceId`/`bootId` whitespace only | Passes (`!value` is false for `" "`) | `isBlank()` rejects | Reject blank values |
| `reason` whitespace only for invalid | Passes (truthy string) | `isBlank()` rejects | Reject blank reason |
| Date-only or no-offset timestamp | Passes `Date.parse` | `Instant.parse` rejects | Reject with explicit timestamp reason |
| `deviceId` containing `/` | Passes if raw topic matches | Backend can store it; `validated/+` subscription would not receive it | Confirm topic/deviceId policy with C |
| Extra `patientId` in payload | Passes through | Payload must not set ownership | Ignore/reject; always leave `patientId` null |
| Duplicate sequence | Gateway may reject in-memory | Unique index returns `DUPLICATE` | Treat Mongo duplicate as `DUPLICATE`, not error |

### 5.3 Gateway rejection reasons

The validation function can emit these reasons (`flows.json:76`):

| Reason | Trigger |
| --- | --- |
| `invalid_json` | Payload is not a non-array object |
| `invalid_schema_version` | `schemaVersion !== 1` |
| `invalid_identifiers` | Bad/missing `deviceId`, `bootId`, or unsafe/non-positive integer `sequence` |
| `topic_device_mismatch` | Topic is not exactly `smartcare/v1/raw/{deviceId}` |
| `invalid_timestamp` | `acquiredAtUtc` is not a string accepted by `Date.parse` |
| `invalid_quality` | Quality is not `good` or `invalid` |
| `invalid_measurements` | Good quality but HR/SpO2 is not a finite number |
| `out_of_range` | HR <= 0 or > 300; SpO2 < 0 or > 100 |
| `invalid_missing_data_format` | Invalid quality but HR/SpO2 are not null or `reason` is not a truthy string |
| `duplicate_or_old_sequence` | Sequence <= last in-memory sequence for `deviceId:bootId` |

The backend does not need to reproduce these strings for the `validated` topic, but the receiver should expose a stable rejection reason in its own result/logs. The existing backend has no ingestion rejection enum yet.

### 5.4 Persistence behaviour relevant to ingestion

- `MeasurementRepository.save()` calls `schemaInitializer.ensureReady()` before every insert (`MeasurementRepository.java:42-45`). A schema/Mongo outage surfaces as `SchemaNotReadyException`, not as a duplicate.
- Duplicate handling catches `MongoWriteException` only when the error category is `DUPLICATE_KEY` (`MeasurementRepository.java:47-57`).
- Other write failures (including document validation failures) are rethrown; the receiver must classify them as `STORE_FAILED` or `REJECTED`, not let them escape the MQTT callback.
- Duplicate logging currently includes `deviceId`, `bootId`, `sequence`, and `clockStatus` at INFO (`MeasurementRepository.java:52-55`). That is broader than the stated rule of logging only `deviceId` and `sequence` at INFO. Decide whether Phase 2 should narrow the existing log line.
- `SchemaInitializer` is lazy and retries `initialize()` when `ensureReady()` is called after a failure (`SchemaInitializer.java:87-99`). The health endpoint should therefore treat `isReady()==false` or `SchemaNotReadyException` as 503.
- `MeasurementMapper.fromDocument()` assumes `acquiredAt` and `receivedAt` are non-null dates (`MeasurementMapper.java:34-35`); the strict Mongo schema is what protects that assumption.

## 6. Live capture evidence

Broker: `docker compose -f iot/broker/docker-compose.yml up -d mosquitto`

Subscriber: `docker exec smartcare-mosquitto mosquitto_sub -t 'smartcare/v1/raw/audit-normal' -C 15 -W 45 -v`

Simulator: `.\.venv-simulator\Scripts\python.exe iot/simulator/simulator.py --scenario normal --device-id audit-normal --seed 42`

Captured results:

- `normal`: 15 messages, one `bootId`, sequences 1–15, one-second timestamps, `quality=good`, `clockStatus=synced`, `source=simulated`.
- `missing`: 15 messages, one `bootId`, sequences 1–5 then 12–21, seven-second gap between sequences 5 and 12.
- `duplicates`: two byte-identical messages with the same `bootId`, sequence 1, and `acquiredAtUtc`.
- `invalid`: 18 messages; sequences 6–8 have `heartRate=null`, `spo2=null`, `quality=invalid`, `reason=no_finger`.
- Two separate simulator launches produced different `bootId` values.

The broker was started for this capture and stopped afterwards; no broker, gateway, simulator, or frontend source was modified.

## 7. UNKNOWNs and assumptions to confirm with C

Please confirm/correct these points:

1. The deployed gateway is exactly `iot/gateway/flows/flows.json`; no local Node-RED edit changes the validated payload or adds fields.
2. `smartcare/v1/validated/{deviceId}` is the only topic the backend should consume, with QoS 1 and no retain.
3. `deviceId` is always one MQTT topic segment (no `/`, `+`, `#`, or NUL). If not, should the backend subscribe to `smartcare/v1/validated/#` instead of `validated/+`?
4. Pre-sync measurements will be rejected until the clock is synced. Does the device ever publish before sync, and what exact `clockStatus` value indicates that the clock is synced? Should the receiver require the literal `"synced"`?
5. `clockStatus` is always present. Is `"synced"` the only expected value, or can the backend see other values for measurements that are still safe to store?
6. `source` is always present and is a string. Should the backend preserve it, ignore it, or enforce an allowed set?
7. `heartRate` and `spo2` are integers (not floats) when non-null. Should the backend reject float values rather than truncate?
8. The gateway’s in-memory `duplicate_or_old_sequence` filter is acceptable as a first-line filter, while the backend unique index remains authoritative. Confirm that late/out-of-order messages may be dropped by the gateway.
9. A payload may contain extra fields such as `patientId`; the backend must ignore/reject them and never use them for ownership.
10. The gateway debug nodes (`Valid Measurements`, `Rejected Measurements`) are acceptable for the current local setup; they can print payloads to Node-RED’s debug sidebar.

## 8. Phase 2 decisions

1. **Pre-sync policy — RESOLVED 2026-11-14:** Reject measurements until the device clock is synced. Require a valid `acquiredAtUtc` and a synced `clockStatus`; no schema change. Confirm the exact synced status value with C.
2. **Subscription wildcard:** Use `smartcare/v1/validated/+` only if `deviceId` is guaranteed to be one topic segment; otherwise use `#` or enforce the segment rule upstream.
3. **Timestamp parser:** Prefer a strict `Instant.parse`-compatible policy and reject date-only/no-offset values, or deliberately emulate the gateway’s broader `Date.parse` behaviour.
4. **Numeric strictness:** Reject non-integral HR/SpO2, and enforce the same technical ranges as the gateway (HR 1–300, SpO2 0–100) in the receiver.
5. **Duplicate authority:** Keep the backend unique index as the authoritative duplicate check; treat gateway-filtered duplicates as an optimisation, not a guarantee.
6. **Existing INFO log:** Should Phase 2 narrow `MeasurementRepository`’s duplicate log from `deviceId/bootId/sequence/clockStatus` to only `deviceId/sequence`? This is a change to existing code and needs approval.
7. **`source`/`clockStatus` handling:** Decide whether to preserve arbitrary strings or enforce allowed values in the receiver.

## 9. Audit status summary

| Audit item | Status |
| --- | --- |
| 1. Raw payload contract | CONFIRMED |
| 1. Validated payload transformation | CONFIRMED from flow source; runtime delivery INFERRED |
| 2. `bootId`/`sequence` behaviour | CONFIRMED by source and live capture |
| 3. Topic/QoS/retain/auth/TLS | CONFIRMED |
| 4. `acquiredAtUtc`/`clockStatus` | CONFIRMED for simulator; pre-sync policy decided: reject until synced |
| 5. Payload-to-`Measurement` mapping | CONFIRMED; several gateway/backend mismatches must be handled by the receiver |

**Phase 1 stops here.** No Phase 2 source, test, schema, or gateway changes have been made. The pre-sync timestamp decision is recorded; Phase 2 awaits explicit approval.
