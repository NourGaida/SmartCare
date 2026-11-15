package com.smartcare.ingestion;

import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.SaveResult;
import com.smartcare.persistence.SchemaNotReadyException;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonException;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

@ApplicationScoped
public class MeasurementMessageHandler {

    static final int MAX_PAYLOAD_BYTES = 8 * 1024;

    private static final Logger LOG = Logger.getLogger(MeasurementMessageHandler.class.getName());
    private static final BigDecimal SCHEMA_VERSION_ONE = BigDecimal.ONE;

    private final MeasurementStore store;
    private final String topicPrefix;
    private final Set<String> acceptedClockStatuses;

    protected MeasurementMessageHandler() {
        this.store = null;
        this.topicPrefix = null;
        this.acceptedClockStatuses = null;
    }

    @Inject
    public MeasurementMessageHandler(MeasurementStore store, IngestionConfig config) {
        this(store, config.topicPrefix(), config.acceptedClockStatuses());
    }

    MeasurementMessageHandler(MeasurementStore store, String topicPrefix, Set<String> acceptedClockStatuses) {
        this.store = store;
        this.topicPrefix = topicPrefix;
        this.acceptedClockStatuses = acceptedClockStatuses;
    }

    public IngestionResult handle(String topic, String payload) {
        return handle(topic, payload == null ? null : payload.getBytes(StandardCharsets.UTF_8));
    }

    public IngestionResult handle(String topic, byte[] payload) {
        if (payload == null || payload.length == 0) {
            return IngestionResult.rejected("invalid_json");
        }
        if (payload.length > MAX_PAYLOAD_BYTES) {
            return IngestionResult.rejected("payload_too_large");
        }

        JsonObject json;
        try (JsonReader reader = Json.createReader(new ByteArrayInputStream(payload))) {
            JsonValue value = reader.readValue();
            if (value == null || value.getValueType() != JsonValue.ValueType.OBJECT) {
                return IngestionResult.rejected("invalid_json");
            }
            json = value.asJsonObject();
        } catch (JsonException | IllegalStateException e) {
            return IngestionResult.rejected("invalid_json");
        }

        JsonValue schemaValue = json.get("schemaVersion");
        if (schemaValue == null || schemaValue.getValueType() != JsonValue.ValueType.NUMBER) {
            return IngestionResult.rejected("invalid_schema_version");
        }
        try {
            if (((JsonNumber) schemaValue).bigDecimalValue().compareTo(SCHEMA_VERSION_ONE) != 0) {
                return IngestionResult.rejected("invalid_schema_version");
            }
        } catch (NumberFormatException e) {
            return IngestionResult.rejected("invalid_schema_version");
        }

        String deviceId = stringValue(json, "deviceId");
        if (deviceId == null || deviceId.isBlank()) {
            return IngestionResult.rejected("invalid_identifiers");
        }
        String bootId = stringValue(json, "bootId");
        if (bootId == null || bootId.isBlank()) {
            return IngestionResult.rejected("invalid_identifiers", deviceId, null);
        }
        Long sequence = integralValue(json, "sequence");
        if (sequence == null || sequence < 1) {
            return IngestionResult.rejected("invalid_identifiers", deviceId, sequence);
        }

        String acquiredAtRaw = stringValue(json, "acquiredAtUtc");
        Instant acquiredAt;
        try {
            acquiredAt = acquiredAtRaw == null
                    ? null
                    : OffsetDateTime.parse(acquiredAtRaw).toInstant();
        } catch (DateTimeParseException e) {
            acquiredAt = null;
        }
        if (acquiredAt == null) {
            return IngestionResult.rejected("invalid_timestamp", deviceId, sequence);
        }

        String quality = stringValue(json, "quality");
        if (!"good".equals(quality) && !"invalid".equals(quality)) {
            return IngestionResult.rejected("invalid_quality", deviceId, sequence);
        }

        String clockStatus = stringValue(json, "clockStatus");
        if (clockStatus == null || acceptedClockStatuses == null
                || !acceptedClockStatuses.contains(clockStatus)) {
            return IngestionResult.rejected("clock_not_synced", deviceId, sequence);
        }

        String source = stringValue(json, "source");
        if (source == null || source.isBlank()) {
            return IngestionResult.rejected("invalid_source", deviceId, sequence);
        }

        Integer heartRate;
        Integer spo2;
        String reason;
        if ("good".equals(quality)) {
            Long heartRateValue = integralValue(json, "heartRate");
            Long spo2Value = integralValue(json, "spo2");
            if (heartRateValue == null || spo2Value == null) {
                return IngestionResult.rejected("invalid_measurements", deviceId, sequence);
            }
            if (heartRateValue < 1 || heartRateValue > 300
                    || spo2Value < 0 || spo2Value > 100) {
                return IngestionResult.rejected("out_of_range", deviceId, sequence);
            }
            JsonValue reasonValue = json.get("reason");
            if (reasonValue != null
                    && reasonValue.getValueType() != JsonValue.ValueType.NULL
                    && reasonValue.getValueType() != JsonValue.ValueType.STRING) {
                return IngestionResult.rejected("invalid_measurements", deviceId, sequence);
            }
            reason = reasonValue == null || reasonValue.getValueType() == JsonValue.ValueType.NULL
                    ? null
                    : ((JsonString) reasonValue).getString();
            heartRate = heartRateValue.intValue();
            spo2 = spo2Value.intValue();
        } else {
            if (!isJsonNull(json, "heartRate") || !isJsonNull(json, "spo2")) {
                return IngestionResult.rejected("invalid_missing_data_format", deviceId, sequence);
            }
            String invalidReason = stringValue(json, "reason");
            if (invalidReason == null || invalidReason.isBlank()) {
                return IngestionResult.rejected("invalid_missing_data_format", deviceId, sequence);
            }
            reason = invalidReason;
            heartRate = null;
            spo2 = null;
        }

        if (!topicMatches(topic, deviceId)) {
            return IngestionResult.rejected("topic_mismatch", deviceId, sequence);
        }

        Measurement measurement = new Measurement(
                deviceId,
                bootId,
                sequence,
                acquiredAt,
                Instant.now(),
                heartRate,
                spo2,
                quality,
                reason,
                clockStatus,
                source,
                null,
                1);

        try {
            SaveResult result = store.save(measurement);
            if (result == SaveResult.DUPLICATE) {
                return IngestionResult.duplicate(deviceId, sequence);
            }
            return IngestionResult.saved(deviceId, sequence);
        } catch (SchemaNotReadyException e) {
            return IngestionResult.rejected("store_failed", deviceId, sequence);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Measurement store failure for deviceId=" + deviceId
                    + ", sequence=" + sequence + ": " + e.getClass().getSimpleName());
            return IngestionResult.rejected("store_failed", deviceId, sequence);
        }
    }

    private boolean topicMatches(String topic, String deviceId) {
        if (topic == null || topicPrefix == null || topicPrefix.isBlank()) {
            return false;
        }
        String expectedPrefix = topicPrefix + "/";
        if (!topic.startsWith(expectedPrefix)) {
            return false;
        }
        String suffix = topic.substring(expectedPrefix.length());
        return !suffix.isEmpty() && suffix.indexOf('/') < 0 && suffix.equals(deviceId);
    }

    private static String stringValue(JsonObject json, String name) {
        JsonValue value = json.get(name);
        if (value == null || value.getValueType() != JsonValue.ValueType.STRING) {
            return null;
        }
        return ((JsonString) value).getString();
    }

    private static Long integralValue(JsonObject json, String name) {
        JsonValue value = json.get(name);
        if (value == null || value.getValueType() != JsonValue.ValueType.NUMBER) {
            return null;
        }
        JsonNumber number = (JsonNumber) value;
        if (!number.isIntegral()) {
            return null;
        }
        try {
            return number.longValue();
        } catch (ArithmeticException | NumberFormatException e) {
            return null;
        }
    }

    private static boolean isJsonNull(JsonObject json, String name) {
        JsonValue value = json.get(name);
        return value != null && value.getValueType() == JsonValue.ValueType.NULL;
    }
}
