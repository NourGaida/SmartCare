package com.smartcare.persistence;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

@ApplicationScoped
public class MongoProvider {

    static final long DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 2000L;
    private static final String SERVER_SELECTION_TIMEOUT_ENV = "MONGODB_SERVER_SELECTION_TIMEOUT_MS";
    private static final Logger LOG = Logger.getLogger(MongoProvider.class.getName());

    private MongoClient client;
    private MongoDatabase database;

    public MongoProvider() {
        // CDI uses this no-arg constructor; init() applies the environment settings.
    }

    // Visible for tests: connects immediately to the given URI without touching process
    // environment variables, so the timeout can be exercised with an unreachable host.
    public MongoProvider(String uri, long serverSelectionTimeoutMs) {
        connect(uri, serverSelectionTimeoutMs);
    }

    @PostConstruct
    void init() {
        connect(env("MONGODB_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMs());
    }

    public MongoDatabase database() {
        return database;
    }

    @PreDestroy
    public void close() {
        if (client != null) {
            client.close();
        }
    }

    private void connect(String uri, long serverSelectionTimeoutMs) {
        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString(uri))
                // The driver default is 30 s; /health/database must fail fast instead.
                .applyToClusterSettings(builder ->
                        builder.serverSelectionTimeout(serverSelectionTimeoutMs, TimeUnit.MILLISECONDS))
                .build();
        client = MongoClients.create(settings);
        database = client.getDatabase(env("MONGODB_DATABASE", "smartcare"));
    }

    static long serverSelectionTimeoutMs() {
        return parseServerSelectionTimeout(System.getenv(SERVER_SELECTION_TIMEOUT_ENV));
    }

    // Missing, malformed or non-positive values fall back to 2 s rather than failing
    // startup, so a typo in the environment cannot make the health endpoint hang.
    static long parseServerSelectionTimeout(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_SERVER_SELECTION_TIMEOUT_MS;
        }
        try {
            long parsed = Long.parseLong(raw.trim());
            if (parsed > 0) {
                return parsed;
            }
        } catch (NumberFormatException e) {
            LOG.warning(SERVER_SELECTION_TIMEOUT_ENV + " is not a number: " + raw);
            return DEFAULT_SERVER_SELECTION_TIMEOUT_MS;
        }
        LOG.warning(SERVER_SELECTION_TIMEOUT_ENV + " must be positive: " + raw);
        return DEFAULT_SERVER_SELECTION_TIMEOUT_MS;
    }

    private static String env(String name, String defaultValue) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
