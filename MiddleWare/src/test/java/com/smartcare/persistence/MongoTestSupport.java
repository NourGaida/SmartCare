package com.smartcare.persistence;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;

import java.time.Instant;
import java.util.concurrent.TimeUnit;

final class MongoTestSupport {

    static final String URI = "mongodb://localhost:27017";
    static final String DATABASE = "smartcare_test";

    private MongoTestSupport() {
    }

    static MongoClient newClient() {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString(URI))
                .applyToClusterSettings(builder ->
                        builder.serverSelectionTimeout(2, TimeUnit.SECONDS))
                .build();
        return MongoClients.create(settings);
    }

    static boolean reachable(MongoClient client) {
        try {
            client.getDatabase("admin").runCommand(new Document("ping", 1));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    static Measurement good(String deviceId, String bootId, long sequence) {
        Instant acquiredAt = Instant.parse("2026-11-01T12:00:00Z").plusSeconds(sequence);
        return new Measurement(deviceId, bootId, sequence, acquiredAt,
                acquiredAt.plusMillis(250), 75, 98, "good", null,
                "synced", "simulated", null, 1);
    }

    static Measurement invalid(String deviceId, String bootId, long sequence) {
        Instant acquiredAt = Instant.parse("2026-11-01T12:00:00Z").plusSeconds(sequence);
        return new Measurement(deviceId, bootId, sequence, acquiredAt,
                acquiredAt.plusMillis(250), null, null, "invalid", "no_finger",
                "synced", "simulated", null, 1);
    }
}
