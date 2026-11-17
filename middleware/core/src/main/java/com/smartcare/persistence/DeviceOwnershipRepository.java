package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;
import org.bson.conversions.Bson;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@ApplicationScoped
public class DeviceOwnershipRepository {

    private final MongoCollection<Document> collection;

    protected DeviceOwnershipRepository() {
        this.collection = null;
    }

    @Inject
    public DeviceOwnershipRepository(MongoProvider provider) {
        this(provider.database());
    }

    DeviceOwnershipRepository(MongoDatabase database) {
        this.collection = database.getCollection(SchemaInitializer.DEVICE_OWNERSHIP);
    }

    public List<Document> findMatching(String deviceId, Date acquiredAt) {
        Bson filter = Filters.and(
                Filters.eq("deviceId", deviceId),
                Filters.lte("validFrom", acquiredAt),
                Filters.or(
                        Filters.eq("validTo", null),
                        Filters.gt("validTo", acquiredAt)));
        return collection.find(filter).sort(Sorts.descending("validFrom")).into(new ArrayList<>());
    }
}
