package com.smartcare.ingestion;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IngestionCountersTest {

    @Test
    void snapshotReportsCountsAndLastRejection() {
        IngestionCounters counters = new IngestionCounters();
        counters.setConnected(true);
        counters.messageReceived();
        counters.saved();
        counters.duplicate();
        counters.rejected("topic_mismatch");
        counters.storeFailed("store_failed");

        IngestionCounters.Snapshot snapshot = counters.snapshot();

        assertTrue(snapshot.connected());
        assertEquals(1, snapshot.received());
        assertEquals(1, snapshot.saved());
        assertEquals(1, snapshot.duplicate());
        assertEquals(2, snapshot.rejected());
        assertEquals(1, snapshot.storeFailed());
        assertEquals("store_failed", snapshot.lastRejectionReason());
        assertEquals(1, snapshot.rejectedByReason().get("topic_mismatch"));
        assertEquals(1, snapshot.rejectedByReason().get("store_failed"));
        assertNotNull(snapshot.lastMessageAt());

        counters.setConnected(false);
        assertFalse(counters.snapshot().connected());
    }
}
