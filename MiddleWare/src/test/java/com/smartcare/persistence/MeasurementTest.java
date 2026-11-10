package com.smartcare.persistence;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertThrows;

class MeasurementTest {

    private static final Instant ACQUIRED = Instant.parse("2026-11-01T12:00:00Z");
    private static final Instant RECEIVED = ACQUIRED.plusSeconds(1);

    @Test
    void rejectsGoodQualityWithNullSpo2() {
        assertThrows(IllegalArgumentException.class, () -> new Measurement(
                "sc-001", "boot-A", 1, ACQUIRED, RECEIVED,
                75, null, "good", null, "synced", "simulated", null, 1));
    }

    @Test
    void rejectsSequenceBelowOne() {
        assertThrows(IllegalArgumentException.class, () -> new Measurement(
                "sc-001", "boot-A", 0, ACQUIRED, RECEIVED,
                75, 98, "good", null, "synced", "simulated", null, 1));
    }

    @Test
    void rejectsNonGoodQualityWithBlankReason() {
        assertThrows(IllegalArgumentException.class, () -> new Measurement(
                "sc-001", "boot-A", 1, ACQUIRED, RECEIVED,
                null, null, "invalid", "   ", "synced", "simulated", null, 1));
    }
}
