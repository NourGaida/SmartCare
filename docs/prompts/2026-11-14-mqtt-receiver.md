Approved. Implement Phase 2 exactly as specified, with these decisions:

1. Pre-sync: accept `acquiredAtUtc` when `clockStatus == "synced"` (configurable accepted set, case-sensitive, default `synced`). If not accepted, `REJECTED`, reason `clock_not_synced`, counted in `rejectedByReason`. Do not add schema validation for boot time.
2. Subscription: `MQTT_TOPIC=smartcare/v1/validated/#`, then require topic = configured prefix + exactly one non-empty segment equal to payload `deviceId`; else `REJECTED` `topic_mismatch`, counted.
3. Timestamps: strict `Instant.parse`; must include offset/`Z`; else `invalid_timestamp`. Store UTC at millisecond precision as existing `Measurement`/Mongo types require.
4. Numbers: JSON number must be integral for `heartRate`/`spo2`; reject floats, never truncate. Good quality: HR 1–300, SpO2 0–100. Invalid quality: both may be null; reason nonblank. Null heartRate/spo2 with good quality => reject.
5. Identifiers: `deviceId`/`bootId` nonblank strings; `sequence` non-negative integer; `quality` exactly `good`/`invalid`. Negative sequence or non-integral => `invalid_identifiers`. `sequence=0` is non-negative but existing `Measurement`/Mongo require `>=1`, so document and reject 0 without schema change.
6. `source`: require nonblank string, keep original value. Do not restrict allowed values without C’s confirmation. `patientId` and extra fields ignored, never stored, never used for ownership.
7. Mongo unique index remains only duplicate authority; gateway in-memory filter is not trusted.
8. Add `rejectedByReason` map to counters and `GET /api/health/ingestion`; 503 `{"status":"error"}` if Mongo/schema not ready; body reports `connected=false` when broker down.
9. Node-RED cannot run here; do not claim end-to-end gateway test. Verify by publishing directly to the validated topic.
10. Everything else as in Phase 2 specification: one commit per logical step, tests first, docs/CI/script/attribution/PR draft, deploy and verify, stop after Phase 2.
