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
import java.util.concurrent.TimeUnit;

@ApplicationScoped
public class LoginAttemptRepository {

    public static final String COLLECTION = "login_attempts";
    private final MongoCollection<Document> collection;

    protected LoginAttemptRepository() { this.collection = null; }

    @Inject
    public LoginAttemptRepository(MongoProvider provider) { this(provider.database()); }

    public LoginAttemptRepository(MongoDatabase database) {
        this.collection = database.getCollection(COLLECTION);
        collection.createIndex(Indexes.ascending("expiresAt"),
                new IndexOptions().expireAfter(0L, TimeUnit.SECONDS).name("ttl_attempt_expires"));
    }

    public long incrementAndGet(String key, Instant windowEnd) {
        Document updated = collection.findOneAndUpdate(
                Filters.eq("_id", key),
                new Document("$inc", new Document("count", 1))
                        .append("$setOnInsert", new Document("_id", key).append("expiresAt", Date.from(windowEnd))),
                new com.mongodb.client.model.FindOneAndUpdateOptions().upsert(true).returnDocument(com.mongodb.client.model.ReturnDocument.AFTER));
        return updated == null ? 1 : ((Number) updated.get("count")).longValue();
    }

    public long getCount(String key) {
        Document doc = collection.find(Filters.eq("_id", key)).first();
        return doc == null ? 0 : ((Number) doc.get("count")).longValue();
    }

    public void reset(String key) {
        collection.deleteOne(Filters.eq("_id", key));
    }
}
