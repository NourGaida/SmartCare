package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.ReplaceOptions;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class SessionRepository {

    public static final String COLLECTION = "sessions";
    private final MongoCollection<Document> collection;

    protected SessionRepository() { this.collection = null; }

    @Inject
    public SessionRepository(MongoProvider provider) {
        this(provider.database());
    }

    public SessionRepository(MongoDatabase database) {
        this.collection = database.getCollection(COLLECTION);
        ensureIndexes();
    }

    private void ensureIndexes() {
        collection.createIndex(Indexes.ascending("expiresAt"),
                new IndexOptions().expireAfter(0L, TimeUnit.SECONDS).name("ttl_session_expires"));
        collection.createIndex(Indexes.ascending("userId"), new IndexOptions().name("ix_session_user"));
    }

    public void save(String sessionId, String userId, String role, String csrfToken,
                     Instant createdAt, Instant lastAccessAt, Instant expiresAt) {
        Document doc = new Document("_id", sessionId)
                .append("sessionId", sessionId)
                .append("userId", userId)
                .append("role", role)
                .append("csrfToken", csrfToken)
                .append("createdAt", Date.from(createdAt))
                .append("lastAccessAt", Date.from(lastAccessAt))
                .append("expiresAt", Date.from(expiresAt));
        collection.replaceOne(Filters.eq("_id", sessionId), doc, new ReplaceOptions().upsert(true));
    }

    public Optional<Document> findById(String sessionId) {
        if (sessionId == null) return Optional.empty();
        return Optional.ofNullable(collection.find(Filters.eq("_id", sessionId)).first());
    }

    public void deleteById(String sessionId) {
        if (sessionId != null) collection.deleteOne(Filters.eq("_id", sessionId));
    }

    public void deleteByUserId(String userId) {
        if (userId != null) collection.deleteMany(Filters.eq("userId", userId));
    }

    public void touch(String sessionId, Instant lastAccessAt, Instant expiresAt) {
        collection.updateOne(Filters.eq("_id", sessionId),
                new Document("$set", new Document("lastAccessAt", Date.from(lastAccessAt))
                        .append("expiresAt", Date.from(expiresAt))));
    }
}
