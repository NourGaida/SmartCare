package com.smartcare.persistence;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MeasurementRepositoryTest {

    private static MongoClient client;
    private static MongoDatabase database;

    private SchemaInitializer initializer;
    private MeasurementRepository repository;

    @BeforeAll
    static void connect() {
        client = MongoTestSupport.newClient();
        Assumptions.assumeTrue(MongoTestSupport.reachable(client),
                "MongoDB not reachable at " + MongoTestSupport.URI + " - skipping integration tests");
        database = client.getDatabase(MongoTestSupport.DATABASE);
    }

    @AfterAll
    static void close() {
        if (client != null) {
            client.close();
        }
    }

    @BeforeEach
    void reset() {
        database.drop();
        initializer = new SchemaInitializer(database);
        assertTrue(initializer.initialize());
        repository = new MeasurementRepository(database, initializer);
    }

    @Test
    void duplicateMeasurementStoredOnce() {
        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 1);

        assertEquals(SaveResult.SAVED, repository.save(measurement));
        assertEquals(SaveResult.DUPLICATE, repository.save(measurement));
        assertEquals(1, repository.countByDevice("sc-001"));
    }

    @Test
    void differentSequenceSameDeviceSavesBoth() {
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-001", "boot-A", 1)));
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-001", "boot-A", 2)));
        assertEquals(2, repository.countByDevice("sc-001"));
    }

    @Test
    void sameBootSequenceDifferentDeviceSavesBoth() {
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-001", "boot-A", 1)));
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-002", "boot-A", 1)));
        assertEquals(1, repository.countByDevice("sc-001"));
        assertEquals(1, repository.countByDevice("sc-002"));
    }

    @Test
    void sameDeviceDifferentBootIdSavesBoth() {
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-001", "boot-A", 1)));
        assertEquals(SaveResult.SAVED, repository.save(MongoTestSupport.good("sc-001", "boot-B", 1)));
        assertEquals(2, repository.countByDevice("sc-001"));
    }

    @Test
    void invalidReadingRoundTripsIdentically() {
        Measurement measurement = MongoTestSupport.invalid("sc-001", "boot-A", 5);

        assertEquals(SaveResult.SAVED, repository.save(measurement));
        Measurement stored = repository.findByKey("sc-001", "boot-A", 5).orElseThrow();

        assertEquals(measurement, stored);
        assertNull(stored.heartRate());
        assertNull(stored.spo2());
        assertEquals("invalid", stored.quality());
        assertEquals("no_finger", stored.reason());
    }

    @Test
    void instantValuesSurviveRoundTripAtMillisecondPrecision() {
        Instant acquired = Instant.ofEpochMilli(1_700_000_000_123L).plusNanos(456_789);
        Measurement measurement = new Measurement("sc-001", "boot-A", 7, acquired,
                acquired.plusNanos(1_999_999), 80, 97, "good", null,
                "synced", "simulated", null, 1);

        assertEquals(0, measurement.acquiredAt().getNano() % 1_000_000);
        assertEquals(SaveResult.SAVED, repository.save(measurement));

        Measurement stored = repository.findByKey("sc-001", "boot-A", 7).orElseThrow();
        assertEquals(measurement.acquiredAt(), stored.acquiredAt());
        assertEquals(measurement.receivedAt(), stored.receivedAt());
        assertEquals(measurement, stored);
    }

    @Test
    void twentyConcurrentInsertsProduceOneSaved() throws Exception {
        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 42);
        int threads = 20;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<SaveResult>> futures = new ArrayList<>();

        try {
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return repository.save(measurement);
                }));
            }
            start.countDown();

            int saved = 0;
            int duplicates = 0;
            for (Future<SaveResult> future : futures) {
                if (future.get(30, TimeUnit.SECONDS) == SaveResult.SAVED) {
                    saved++;
                } else {
                    duplicates++;
                }
            }

            assertEquals(1, saved);
            assertEquals(19, duplicates);
            assertEquals(1, repository.countByDevice("sc-001"));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void duplicatesRejectedCountsOnePerRejectedDuplicate() {
        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 1);

        assertEquals(0, repository.duplicatesRejected());
        repository.save(measurement);
        assertEquals(0, repository.duplicatesRejected());

        repository.save(measurement);
        assertEquals(1, repository.duplicatesRejected());

        repository.save(MongoTestSupport.good("sc-001", "boot-A", 2));
        assertEquals(1, repository.duplicatesRejected());
    }

    @Test
    void sameKeyDifferentValuesIsDuplicateAndFirstStays() {
        Instant acquired = Instant.parse("2026-11-01T12:00:00Z");
        Measurement first = new Measurement("sc-001", "boot-A", 3, acquired,
                acquired.plusSeconds(1), 70, 96, "good", null,
                "synced", "simulated", null, 1);
        Measurement second = new Measurement("sc-001", "boot-A", 3, acquired.plusSeconds(30),
                acquired.plusSeconds(31), 120, 90, "good", null,
                "synced", "simulated", null, 1);

        assertEquals(SaveResult.SAVED, repository.save(first));
        assertEquals(SaveResult.DUPLICATE, repository.save(second));

        Measurement stored = repository.findByKey("sc-001", "boot-A", 3).orElseThrow();
        assertEquals(first, stored);
        assertEquals(70, stored.heartRate());
        assertEquals(acquired, stored.acquiredAt());
    }

    @Test
    void saveInitializesSchemaWhenMongoComesBack() {
        database.drop();
        AtomicBoolean available = new AtomicBoolean(false);
        SchemaInitializer lazy = new SchemaInitializer(() -> {
            if (!available.get()) {
                throw new IllegalStateException("simulated MongoDB outage");
            }
            return database;
        });

        assertFalse(lazy.initialize());
        assertFalse(lazy.isReady());

        MeasurementRepository recovering = new MeasurementRepository(database, lazy);
        available.set(true);

        assertEquals(SaveResult.SAVED, recovering.save(MongoTestSupport.good("sc-001", "boot-A", 1)));
        assertTrue(lazy.isReady());
        assertTrue(indexExists("uq_device_boot_sequence"));
        assertEquals(1, recovering.countByDevice("sc-001"));
    }

    @Test
    void saveFailsWhenSchemaNotReadyAndDatabaseUnreachable() {
        database.drop();
        SchemaInitializer broken = new SchemaInitializer(() -> {
            throw new IllegalStateException("simulated MongoDB outage");
        });
        MeasurementRepository blocked = new MeasurementRepository(database, broken);

        assertThrows(SchemaNotReadyException.class,
                () -> blocked.save(MongoTestSupport.good("sc-001", "boot-A", 1)));
        assertFalse(broken.isReady());
        assertEquals(0, database.getCollection("measurements").countDocuments());
    }

    private boolean indexExists(String name) {
        for (Document index : database.getCollection("measurements").listIndexes()) {
            if (name.equals(index.getString("name"))) {
                return true;
            }
        }
        return false;
    }
}
