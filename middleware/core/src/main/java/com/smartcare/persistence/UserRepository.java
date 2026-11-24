package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.util.Optional;
import java.util.Locale;

@ApplicationScoped
public class UserRepository {

    public static final String COLLECTION = "users";
    private final MongoCollection<Document> collection;

    protected UserRepository() { this.collection = null; }

    @Inject
    public UserRepository(MongoProvider provider) { this(provider.database()); }

    public UserRepository(MongoDatabase database) {
        this.collection = database.getCollection(COLLECTION);
        collection.createIndex(Indexes.ascending("email"), new IndexOptions().unique(true).name("uq_user_email"));
        collection.createIndex(Indexes.ascending("userId"), new IndexOptions().unique(true).name("uq_user_id"));
    }

    public Optional<Document> findByEmail(String email) {
        if (email == null) return Optional.empty();
        return Optional.ofNullable(collection.find(Filters.eq("email", email.toLowerCase(Locale.ROOT))).first());
    }

    public Optional<Document> findByUserId(String userId) {
        if (userId == null) return Optional.empty();
        return Optional.ofNullable(collection.find(Filters.eq("userId", userId)).first());
    }

    public void insert(Document user) { collection.insertOne(user); }
}
