package com.smartcare.persistence;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;

import java.util.concurrent.TimeUnit;

public final class IngestionMongoSupport {

    public static final String URI = "mongodb://localhost:27017";
    public static final String DATABASE = "smartcare_test";

    private IngestionMongoSupport() {
    }

    public static MongoClient newClient() {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString(URI))
                .applyToClusterSettings(builder ->
                        builder.serverSelectionTimeout(2, TimeUnit.SECONDS))
                .build();
        return MongoClients.create(settings);
    }

    public static boolean reachable(MongoClient client) {
        try {
            client.getDatabase("admin").runCommand(new Document("ping", 1));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static MeasurementRepository newRepository(MongoDatabase database) {
        SchemaInitializer initializer = new SchemaInitializer(database);
        if (!initializer.initialize()) {
            throw new IllegalStateException("Could not initialize the test schema");
        }
        return new MeasurementRepository(database, initializer);
    }

    public static SchemaInitializer newInitializer(MongoDatabase database) {
        SchemaInitializer initializer = new SchemaInitializer(database);
        if (!initializer.initialize()) {
            throw new IllegalStateException("Could not initialize the test schema");
        }
        return initializer;
    }
}
