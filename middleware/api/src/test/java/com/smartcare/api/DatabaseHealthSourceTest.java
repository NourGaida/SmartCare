package com.smartcare.api;

import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import org.junit.jupiter.api.Test;

import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DatabaseHealthSourceTest {

    @Test
    void reportsServiceUnavailableWhenMongoIsUnreachableWithinTimeout() {
        // Port 1 on loopback is intentionally unreachable: no MongoDB server is needed.
        MongoProvider provider = new MongoProvider("mongodb://127.0.0.1:1", 2000L);
        try {
            DatabaseHealthSource source = new DatabaseHealthSource(provider, new SchemaInitializer(provider));

            long start = System.nanoTime();
            DatabaseHealthSource.DatabaseHealth health = source.check();
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);

            assertEquals(503, health.status());
            assertEquals("{\"status\":\"error\"}", health.body());
            assertTrue(elapsedMs < 10_000,
                    "health check waited " + elapsedMs + " ms; it must not use the driver's 30 s default");
        } finally {
            provider.close();
        }
    }
}
