package com.smartcare.persistence;

import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;
import org.bson.conversions.Bson;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Logger;

import static com.mongodb.client.model.Filters.and;
import static com.mongodb.client.model.Filters.eq;

@ApplicationScoped
public class MeasurementRepository {

    private static final Logger LOG = Logger.getLogger(MeasurementRepository.class.getName());

    private final MongoCollection<Document> collection;
    private final SchemaInitializer schemaInitializer;
    private final AtomicLong duplicatesRejected = new AtomicLong();
    // Required by CDI for the client proxy. Never used for real work.
    protected MeasurementRepository() {
        this.collection = null;
        this.schemaInitializer = null;
    }
    @Inject
    public MeasurementRepository(MongoProvider provider, SchemaInitializer schemaInitializer) {
        this(provider.database(), schemaInitializer);
    }

    MeasurementRepository(MongoDatabase database, SchemaInitializer schemaInitializer) {
        this.collection = database.getCollection(SchemaInitializer.MEASUREMENTS);
        this.schemaInitializer = schemaInitializer;
    }

    public SaveResult save(Measurement measurement) {
        schemaInitializer.ensureReady();
        try {
            collection.insertOne(MeasurementMapper.toDocument(measurement));
            return SaveResult.SAVED;
        } catch (MongoWriteException e) {
            if (e.getError().getCategory() != ErrorCategory.DUPLICATE_KEY) {
                throw e;
            }
            duplicatesRejected.incrementAndGet();
            LOG.info("Duplicate measurement rejected: deviceId=" + measurement.deviceId()
                    + ", bootId=" + measurement.bootId()
                    + ", sequence=" + measurement.sequence()
                    + ", clockStatus=" + measurement.clockStatus());
            return SaveResult.DUPLICATE;
        }
    }

    public Optional<Measurement> findByKey(String deviceId, String bootId, long sequence) {
        Document document = collection.find(keyFilter(deviceId, bootId, sequence)).first();
        return Optional.ofNullable(document).map(MeasurementMapper::fromDocument);
    }

    public long countByDevice(String deviceId) {
        return collection.countDocuments(eq("deviceId", deviceId));
    }

    public long duplicatesRejected() {
        return duplicatesRejected.get();
    }

    private static Bson keyFilter(String deviceId, String bootId, long sequence) {
        return and(eq("deviceId", deviceId), eq("bootId", bootId), eq("sequence", sequence));
    }
}
