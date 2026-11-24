package com.smartcare.ingestion;

import com.smartcare.persistence.AlertRepository;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonException;
import jakarta.json.JsonObject;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class DetectionEventHandler {
    public static final String EVENTS_TOPIC = "smartcare/v1/detection/events";
    public static final String PERSISTED_PREFIX = "smartcare/v1/persisted/";
    private static final String CONFIRMED = "SUSTAINED_ANOMALY_CONFIRMED";
    private static final String RESOLVED = "ANOMALY_RESOLVED";
    private static final Set<String> ANOMALIES = Set.of("HIGH_HEART_RATE", "LOW_SPO2", "LOW_HEART_RATE");

    private final MeasurementRepository measurements;
    private final AlertRepository alerts;

    protected DetectionEventHandler() { this(null, null); }

    @Inject
    public DetectionEventHandler(MeasurementRepository measurements, AlertRepository alerts) {
        this.measurements = measurements;
        this.alerts = alerts;
    }

    public void handle(byte[] payload) {
        if (payload == null || payload.length == 0 || payload.length > MeasurementMessageHandler.MAX_PAYLOAD_BYTES) return;
        DetectorEvent event = parse(payload);
        if (event == null) return;
        // The recorded measurement owns the alert. Ignore payload-supplied ownership and clocks.
        measurements.findByKey(event.deviceId(), event.bootId(), event.sequence())
                .filter(measurement -> measurement.patientId() != null && "good".equals(measurement.quality()))
                .ifPresent(measurement -> {
                    if (CONFIRMED.equals(event.type())) {
                        alerts.confirm(event.id(), event.anomaly(), measurement, findStart(event, measurement));
                    }
                    else alerts.resolve(event.anomaly(), measurement);
                });
    }

    private Instant findStart(DetectorEvent event, Measurement confirmed) {
        if (event.startedSequence() == null) return null;
        if (event.sequence() == event.startedSequence()) return confirmed.acquiredAt();
        return measurements.findByKey(event.deviceId(), event.bootId(), event.startedSequence())
                .filter(row -> confirmed.patientId().equals(row.patientId()) && "good".equals(row.quality())
                        && !row.acquiredAt().isAfter(confirmed.acquiredAt()))
                .map(Measurement::acquiredAt).orElse(null);
    }

    private static DetectorEvent parse(byte[] payload) {
        try (var reader = Json.createReader(new ByteArrayInputStream(payload))) {
            JsonObject json = reader.readObject();
            if (json.getInt("schemaVersion", 0) != 1 || !"smartcare-detector".equals(json.getString("source", ""))) return null;
            String type = json.getString("eventType", "");
            if (!CONFIRMED.equals(type) && !RESOLVED.equals(type)) return null;
            String anomaly = json.getString("anomalyType", "");
            if (!ANOMALIES.contains(anomaly)) return null;
            String deviceId = json.getString("deviceId", "");
            String bootId = json.getString("bootId", "");
            long sequence = json.getJsonNumber("sequence").longValueExact();
            if (deviceId.isBlank() || bootId.isBlank() || sequence < 1) return null;
            UUID id = UUID.fromString(json.getString("eventId", ""));
            var start = json.getJsonNumber("startedSequence");
            Long startedSequence = start == null ? null : start.longValueExact();
            if (startedSequence != null && (startedSequence < 1 || startedSequence > sequence)) return null;
            return new DetectorEvent(id.toString(), deviceId, bootId, sequence, type, anomaly, startedSequence);
        } catch (JsonException | ClassCastException | NullPointerException | IllegalArgumentException | ArithmeticException invalid) {
            return null;
        }
    }

    private record DetectorEvent(String id, String deviceId, String bootId, long sequence,
                                 String type, String anomaly, Long startedSequence) {}
}
