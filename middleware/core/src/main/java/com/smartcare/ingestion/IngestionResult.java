package com.smartcare.ingestion;

import java.util.Objects;

public record IngestionResult(Status status, String reason, String deviceId, Long sequence) {

    public enum Status {
        SAVED,
        DUPLICATE,
        REJECTED
    }

    public IngestionResult {
        Objects.requireNonNull(status, "status");
        if (status == Status.REJECTED) {
            Objects.requireNonNull(reason, "reason");
        }
    }

    public static IngestionResult saved(String deviceId, long sequence) {
        return new IngestionResult(Status.SAVED, null, deviceId, sequence);
    }

    public static IngestionResult duplicate(String deviceId, long sequence) {
        return new IngestionResult(Status.DUPLICATE, null, deviceId, sequence);
    }

    public static IngestionResult rejected(String reason) {
        return new IngestionResult(Status.REJECTED, reason, null, null);
    }

    public static IngestionResult rejected(String reason, String deviceId, Long sequence) {
        return new IngestionResult(Status.REJECTED, reason, deviceId, sequence);
    }
}
