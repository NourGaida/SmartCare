package com.smartcare.persistence;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

public record Measurement(
        String deviceId,
        String bootId,
        long sequence,
        Instant acquiredAt,
        Instant receivedAt,
        Integer heartRate,
        Integer spo2,
        String quality,
        String reason,
        String clockStatus,
        String source,
        String patientId,
        Integer schemaVersion) {

    public Measurement {
        if (deviceId == null || deviceId.isBlank()) {
            throw new IllegalArgumentException("deviceId is required");
        }
        if (bootId == null || bootId.isBlank()) {
            throw new IllegalArgumentException("bootId is required");
        }
        if (sequence < 1) {
            throw new IllegalArgumentException("sequence must be >= 1");
        }
        if (acquiredAt == null) {
            throw new IllegalArgumentException("acquiredAt is required");
        }
        if (receivedAt == null) {
            throw new IllegalArgumentException("receivedAt is required");
        }
        if (quality == null || quality.isBlank()) {
            throw new IllegalArgumentException("quality is required");
        }
        if (clockStatus == null || clockStatus.isBlank()) {
            throw new IllegalArgumentException("clockStatus is required");
        }
        if ("good".equals(quality)) {
            if (heartRate == null || spo2 == null) {
                throw new IllegalArgumentException("good quality requires heartRate and spo2");
            }
        } else if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("non-good quality requires a non-blank reason");
        }
        acquiredAt = acquiredAt.truncatedTo(ChronoUnit.MILLIS);
        receivedAt = receivedAt.truncatedTo(ChronoUnit.MILLIS);
    }
}
