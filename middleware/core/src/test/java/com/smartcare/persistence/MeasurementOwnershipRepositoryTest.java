package com.smartcare.persistence;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.smartcare.ownership.DeviceOwnershipResolver;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Date;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MeasurementOwnershipRepositoryTest {

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
        DeviceOwnershipRepository ownershipRepository = new DeviceOwnershipRepository(database);
        DeviceOwnershipResolver resolver = new DeviceOwnershipResolver(ownershipRepository);
        repository = new MeasurementRepository(database, initializer, resolver);
    }

    @Test
    void storesPatientIdWhenSingleOwnershipMatches() {
        insertOwnership("sc-001", "patient-A", Instant.parse("2026-11-01T12:00:00Z"), null);

        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 1);
        assertEquals(SaveResult.SAVED, repository.save(measurement));

        Measurement stored = repository.findByKey("sc-001", "boot-A", 1).orElseThrow();
        assertEquals("patient-A", stored.patientId());
    }

    @Test
    void storesNullPatientIdWhenNoOwnershipMatches() {
        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 1);
        assertEquals(SaveResult.SAVED, repository.save(measurement));

        Measurement stored = repository.findByKey("sc-001", "boot-A", 1).orElseThrow();
        assertNull(stored.patientId());
    }

    @Test
    void usesLatestValidFromOnOwnershipConflict() {
        insertOwnership("sc-001", "patient-old", Instant.parse("2026-11-01T10:00:00Z"), null);
        insertOwnership("sc-001", "patient-new", Instant.parse("2026-11-01T11:00:00Z"), Instant.parse("2026-11-02T00:00:00Z"));

        Measurement measurement = MongoTestSupport.good("sc-001", "boot-A", 1);
        assertEquals(SaveResult.SAVED, repository.save(measurement));

        Measurement stored = repository.findByKey("sc-001", "boot-A", 1).orElseThrow();
        assertEquals("patient-new", stored.patientId());
    }

    private void insertOwnership(String deviceId, String patientId, Instant validFrom, Instant validTo) {
        org.bson.Document doc = new org.bson.Document("deviceId", deviceId)
                .append("patientId", patientId)
                .append("validFrom", Date.from(validFrom))
                .append("validTo", validTo == null ? null : Date.from(validTo));
        database.getCollection(SchemaInitializer.DEVICE_OWNERSHIP).insertOne(doc);
    }
}
