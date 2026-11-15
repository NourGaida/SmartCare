package com.smartcare.api;

import com.smartcare.ingestion.IngestionCounters;
import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import org.junit.jupiter.api.Test;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IngestionHealthSourceTest {

    @Test
    void reportsServiceUnavailableAndCountersWhenMongoIsUnreachable() {
        MongoProvider provider = new MongoProvider("mongodb://127.0.0.1:1", 2000L);
        try {
            IngestionCounters counters = new IngestionCounters();
            counters.setConnected(false);
            counters.messageReceived();
            counters.rejected("clock_not_synced");
            IngestionHealthSource source = new IngestionHealthSource(
                    provider, new SchemaInitializer(provider), counters);

            long start = System.nanoTime();
            IngestionHealthSource.IngestionHealth health = source.check();
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);

            assertEquals(503, health.status());
            assertTrue(health.body().contains("\"status\":\"error\""));
            assertTrue(health.body().contains("\"connected\":false"));
            assertTrue(health.body().contains("\"received\":1"));
            assertTrue(health.body().contains("\"rejected\":1"));
            assertTrue(health.body().contains("\"clock_not_synced\":1"));
            assertTrue(health.body().contains("\"lastRejectionReason\":\"clock_not_synced\""));
            assertTrue(elapsedMs < 10_000,
                    "health check waited " + elapsedMs + " ms; it must not use the driver's 30 s default");
        } finally {
            provider.close();
        }
    }
}
