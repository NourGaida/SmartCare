package com.smartcare.persistence;

import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SchemaInitializerTest {

    private static MongoClient client;
    private static MongoDatabase database;

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
    void freshSchema() {
        database.drop();
        assertTrue(new SchemaInitializer(database).initialize());
    }

    private Document validDocument() {
        return new Document()
                .append("deviceId", "sc-001")
                .append("bootId", "boot-A")
                .append("sequence", 1L)
                .append("acquiredAt", new Date())
                .append("receivedAt", new Date())
                .append("heartRate", 75)
                .append("spo2", 98)
                .append("quality", "good")
                .append("reason", null)
                .append("clockStatus", "synced")
                .append("source", "simulated")
                .append("patientId", null)
                .append("schemaVersion", 1);
    }

    @Test
    void rejectsDocumentMissingAcquiredAt() {
        Document document = validDocument();
        document.remove("acquiredAt");
        assertThrows(MongoWriteException.class,
                () -> database.getCollection("measurements").insertOne(document));
    }

    @Test
    void rejectsGoodQualityWithStringHeartRate() {
        Document document = validDocument();
        document.put("heartRate", "seventy-five");
        assertThrows(MongoWriteException.class,
                () -> database.getCollection("measurements").insertOne(document));
    }

    @Test
    void rejectsInvalidQualityWithMissingReason() {
        Document document = validDocument();
        document.put("quality", "invalid");
        document.put("heartRate", null);
        document.put("spo2", null);
        document.remove("reason");
        assertThrows(MongoWriteException.class,
                () -> database.getCollection("measurements").insertOne(document));
    }

    @Test
    void rejectsInvalidQualityWithEmptyReason() {
        Document document = validDocument();
        document.put("quality", "invalid");
        document.put("heartRate", null);
        document.put("spo2", null);
        document.put("reason", "");
        assertThrows(MongoWriteException.class,
                () -> database.getCollection("measurements").insertOne(document));
    }

    @Test
    void acceptsInt32Sequence() {
        Document document = validDocument();
        document.put("sequence", 1);
        assertDoesNotThrow(() -> database.getCollection("measurements").insertOne(document));
    }

    @Test
    void initializeTwiceIsIdempotentAndDoesNotDuplicateIndexes() {
        assertTrue(new SchemaInitializer(database).initialize());

        List<String> indexNames = new ArrayList<>();
        database.getCollection("measurements").listIndexes()
                .forEach(index -> indexNames.add(index.getString("name")));

        assertEquals(1, indexNames.stream().filter("uq_device_boot_sequence"::equals).count());
        assertEquals(1, indexNames.stream().filter("ix_patient_time"::equals).count());
    }
}
