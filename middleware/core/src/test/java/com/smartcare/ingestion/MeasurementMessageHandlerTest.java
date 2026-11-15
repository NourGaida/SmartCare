package com.smartcare.ingestion;

import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.SaveResult;
import com.smartcare.persistence.SchemaNotReadyException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class MeasurementMessageHandlerTest {

    private static final String DEVICE_ID = "sc-001";
    private static final String TOPIC = "smartcare/v1/validated/" + DEVICE_ID;
    private static final Object MISSING = new Object();

    private FakeStore store;
    private MeasurementMessageHandler handler;

    @BeforeEach
    void setUp() {
        store = new FakeStore();
        handler = new MeasurementMessageHandler(
                store, "smartcare/v1/validated", Set.of("synced"));
    }

    @Test
    void acceptsValidGoodMessageAndStoresNormalizedMeasurement() {
        IngestionResult result = handler.handle(TOPIC, payload());

        assertEquals(IngestionResult.Status.SAVED, result.status());
        assertEquals(DEVICE_ID, result.deviceId());
        assertEquals(7L, result.sequence());
        Measurement stored = store.saved;
        assertNotNull(stored);
        assertEquals(DEVICE_ID, stored.deviceId());
        assertEquals("boot-1", stored.bootId());
        assertEquals(7L, stored.sequence());
        assertEquals(Instant.parse("2026-11-14T10:00:07Z"), stored.acquiredAt());
        assertNotNull(stored.receivedAt());
        assertEquals(75, stored.heartRate());
        assertEquals(98, stored.spo2());
        assertEquals("good", stored.quality());
        assertNull(stored.reason());
        assertEquals("synced", stored.clockStatus());
        assertEquals("simulated", stored.source());
        assertNull(stored.patientId());
        assertEquals(1, stored.schemaVersion());
    }

    @Test
    void acceptsOffsetTimestampAndIgnoresExtraFields() {
        IngestionResult result = handler.handle(TOPIC, payload(
                "acquiredAtUtc", "2026-11-14T11:00:07+01:00",
                "patientId", "patient-ignored",
                "extra", "ignored"));

        assertEquals(IngestionResult.Status.SAVED, result.status());
        assertEquals(Instant.parse("2026-11-14T10:00:07Z"), store.saved.acquiredAt());
        assertNull(store.saved.patientId());
    }

    @Test
    void acceptsInvalidQualityWithNullMeasurementsAndReason() {
        IngestionResult result = handler.handle(TOPIC, payload(
                "quality", "invalid",
                "heartRate", null,
                "spo2", null,
                "reason", "no_finger"));

        assertEquals(IngestionResult.Status.SAVED, result.status());
        assertNull(store.saved.heartRate());
        assertNull(store.saved.spo2());
        assertEquals("invalid", store.saved.quality());
        assertEquals("no_finger", store.saved.reason());
    }

    @Test
    void acceptsSchemaVersionOneAsDecimal() {
        IngestionResult result = handler.handle(TOPIC, payload("schemaVersion", 1.0));

        assertEquals(IngestionResult.Status.SAVED, result.status());
    }

    @Test
    void returnsDuplicateWithoutChangingTheMeasurement() {
        store.result = SaveResult.DUPLICATE;

        IngestionResult result = handler.handle(TOPIC, payload());

        assertEquals(IngestionResult.Status.DUPLICATE, result.status());
        assertEquals(DEVICE_ID, result.deviceId());
        assertEquals(7L, result.sequence());
        assertNull(result.reason());
    }

    @Test
    void returnsStoreFailedWhenSchemaIsNotReady() {
        store.failure = new SchemaNotReadyException();

        IngestionResult result = handler.handle(TOPIC, payload());

        assertEquals(IngestionResult.Status.REJECTED, result.status());
        assertEquals("store_failed", result.reason());
    }

    @Test
    void returnsStoreFailedForUnexpectedStoreFailure() {
        store.failure = new IllegalStateException("boom");

        IngestionResult result = handler.handle(TOPIC, payload());

        assertEquals(IngestionResult.Status.REJECTED, result.status());
        assertEquals("store_failed", result.reason());
    }

    @Test
    void rejectsMissingAndMalformedPayloads() {
        assertReason("invalid_json", handler.handle(TOPIC, (String) null));
        assertReason("invalid_json", handler.handle(TOPIC, ""));
        assertReason("invalid_json", handler.handle(TOPIC, "{"));
        assertReason("invalid_json", handler.handle(TOPIC, "[]"));
    }

    @Test
    void rejectsOversizedPayloadBeforeParsing() {
        String payload = "x".repeat(MeasurementMessageHandler.MAX_PAYLOAD_BYTES + 1);

        assertReason("payload_too_large",
                handler.handle(TOPIC, payload.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rejectsInvalidSchemaVersion() {
        assertReason("invalid_schema_version", handler.handle(TOPIC, payload("schemaVersion", MISSING)));
        assertReason("invalid_schema_version", handler.handle(TOPIC, payload("schemaVersion", 2)));
        assertReason("invalid_schema_version", handler.handle(TOPIC, payload("schemaVersion", 1.5)));
        assertReason("invalid_schema_version", handler.handle(TOPIC, payload("schemaVersion", "1")));
    }

    @Test
    void rejectsInvalidIdentifiers() {
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("deviceId", MISSING)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("deviceId", "")));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("bootId", MISSING)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("bootId", " ")));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("sequence", MISSING)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("sequence", 7.5)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("sequence", 0)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("sequence", -1)));
        assertReason("invalid_identifiers", handler.handle(TOPIC, payload("sequence", "7")));
    }

    @Test
    void rejectsTopicMismatch() {
        assertReason("topic_mismatch",
                handler.handle("smartcare/v1/other/" + DEVICE_ID, payload()));
        assertReason("topic_mismatch",
                handler.handle("smartcare/v1/validated/" + DEVICE_ID + "/extra", payload()));
        assertReason("topic_mismatch",
                handler.handle("smartcare/v1/validated/sc-002", payload()));
        assertReason("topic_mismatch",
                handler.handle("smartcare/v1/validated/", payload()));
        assertReason("topic_mismatch", handler.handle(null, payload()));
    }

    @Test
    void rejectsInvalidTimestamps() {
        assertReason("invalid_timestamp", handler.handle(TOPIC, payload("acquiredAtUtc", MISSING)));
        assertReason("invalid_timestamp", handler.handle(TOPIC, payload("acquiredAtUtc", "2026-11-14")));
        assertReason("invalid_timestamp",
                handler.handle(TOPIC, payload("acquiredAtUtc", "2026-11-14T10:00:07")));
        assertReason("invalid_timestamp",
                handler.handle(TOPIC, payload("acquiredAtUtc", "not-a-time")));
    }

    @Test
    void rejectsClockStatusOutsideTheAcceptedSet() {
        assertReason("clock_not_synced", handler.handle(TOPIC, payload("clockStatus", MISSING)));
        assertReason("clock_not_synced", handler.handle(TOPIC, payload("clockStatus", "unsynced")));
        assertReason("clock_not_synced", handler.handle(TOPIC, payload("clockStatus", "Synced")));
    }

    @Test
    void rejectsMissingOrBlankSource() {
        assertReason("invalid_source", handler.handle(TOPIC, payload("source", MISSING)));
        assertReason("invalid_source", handler.handle(TOPIC, payload("source", " ")));
        assertReason("invalid_source", handler.handle(TOPIC, payload("source", 42)));
    }

    @Test
    void rejectsUnknownQuality() {
        assertReason("invalid_quality", handler.handle(TOPIC, payload("quality", MISSING)));
        assertReason("invalid_quality", handler.handle(TOPIC, payload("quality", "unknown")));
        assertReason("invalid_quality", handler.handle(TOPIC, payload("quality", 42)));
    }

    @Test
    void rejectsMissingOrNonIntegralGoodMeasurements() {
        assertReason("invalid_measurements", handler.handle(TOPIC, payload("heartRate", MISSING)));
        assertReason("invalid_measurements", handler.handle(TOPIC, payload("heartRate", 75.5)));
        assertReason("invalid_measurements", handler.handle(TOPIC, payload("spo2", MISSING)));
        assertReason("invalid_measurements", handler.handle(TOPIC, payload("spo2", 98.5)));
    }

    @Test
    void rejectsOutOfRangeGoodMeasurements() {
        assertReason("out_of_range", handler.handle(TOPIC, payload("heartRate", 0)));
        assertReason("out_of_range", handler.handle(TOPIC, payload("heartRate", 301)));
        assertReason("out_of_range", handler.handle(TOPIC, payload("spo2", -1)));
        assertReason("out_of_range", handler.handle(TOPIC, payload("spo2", 101)));
    }

    @Test
    void rejectsMalformedInvalidQualityMessages() {
        assertReason("invalid_missing_data_format", handler.handle(TOPIC, payload(
                "quality", "invalid",
                "heartRate", 75,
                "spo2", null,
                "reason", "no_finger")));
        assertReason("invalid_missing_data_format", handler.handle(TOPIC, payload(
                "quality", "invalid",
                "heartRate", null,
                "spo2", null,
                "reason", MISSING)));
        assertReason("invalid_missing_data_format", handler.handle(TOPIC, payload(
                "quality", "invalid",
                "heartRate", null,
                "spo2", null,
                "reason", " ")));
        assertReason("invalid_missing_data_format", handler.handle(TOPIC, payload(
                "quality", "invalid",
                "heartRate", null,
                "spo2", null,
                "reason", 42)));
    }

    private static IngestionResult assertReason(String reason, IngestionResult result) {
        assertEquals(IngestionResult.Status.REJECTED, result.status());
        assertEquals(reason, result.reason());
        return result;
    }

    private static String payload(Object... overrides) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("schemaVersion", 1);
        values.put("deviceId", DEVICE_ID);
        values.put("bootId", "boot-1");
        values.put("sequence", 7L);
        values.put("acquiredAtUtc", "2026-11-14T10:00:07Z");
        values.put("heartRate", 75);
        values.put("spo2", 98);
        values.put("quality", "good");
        values.put("reason", null);
        values.put("clockStatus", "synced");
        values.put("source", "simulated");

        for (int i = 0; i < overrides.length; i += 2) {
            String key = (String) overrides[i];
            Object value = overrides[i + 1];
            if (value == MISSING) {
                values.remove(key);
            } else {
                values.put(key, value);
            }
        }
        return toJson(values);
    }

    private static String toJson(Map<String, Object> values) {
        StringBuilder json = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            if (!first) {
                json.append(',');
            }
            first = false;
            json.append('"').append(entry.getKey()).append("\":");
            Object value = entry.getValue();
            if (value == null) {
                json.append("null");
            } else if (value instanceof Number || value instanceof Boolean) {
                json.append(value);
            } else {
                json.append('"').append(escape(value.toString())).append('"');
            }
        }
        return json.append('}').toString();
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static final class FakeStore implements MeasurementStore {

        private Measurement saved;
        private SaveResult result = SaveResult.SAVED;
        private RuntimeException failure;

        @Override
        public SaveResult save(Measurement measurement) {
            this.saved = measurement;
            if (failure != null) {
                throw failure;
            }
            return result;
        }
    }
}
