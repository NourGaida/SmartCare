package com.smartcare.persistence;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class MongoProvider {

    private MongoClient client;
    private MongoDatabase database;

    @PostConstruct
    void init() {
        String uri = env("MONGODB_URI", "mongodb://localhost:27017");
        String databaseName = env("MONGODB_DATABASE", "smartcare");
        client = MongoClients.create(uri);
        database = client.getDatabase(databaseName);
    }

    public MongoDatabase database() {
        return database;
    }

    @PreDestroy
    void close() {
        if (client != null) {
            client.close();
        }
    }

    private static String env(String name, String defaultValue) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
