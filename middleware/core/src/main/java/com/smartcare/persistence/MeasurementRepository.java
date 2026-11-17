package com.smartcare.persistence;

import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.smartcare.ingestion.IngestionCounters;
import com.smartcare.ingestion.MeasurementStore;
import com.smartcare.ownership.OwnershipResolution;
import com.smartcare.ownership.OwnershipResolver;
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
public class MeasurementRepository implements MeasurementStore {

    private static final Logger LOG = Logger.getLogger(MeasurementRepository.class.getName());

    private final MongoCollection<Document> collection;
    private final SchemaInitializer schemaInitializer;
    private final OwnershipResolver ownershipResolver;
    private final IngestionCounters counters;
    private final AtomicLong duplicatesRejected = new AtomicLong();
    // Required by CDI for the client proxy. Never used for real work.
    protected MeasurementRepository() {
        this.collection = null;
        this.schemaInitializer = null;
        this.ownershipResolver = null;
        this.counters = null;
    }
    @Inject
    public MeasurementRepository(MongoProvider provider, SchemaInitializer schemaInitializer,
            OwnershipResolver ownershipResolver, IngestionCounters counters) {
        this(provider.database(), schemaInitializer, ownershipResolver, counters);
    }

    MeasurementRepository(MongoDatabase database, SchemaInitializer schemaInitializer) {
        this(database, schemaInitializer, null, null);
    }

    MeasurementRepository(MongoDatabase database, SchemaInitializer schemaInitializer,
            OwnershipResolver ownershipResolver) {
        this(database, schemaInitializer, ownershipResolver, null);
    }

    MeasurementRepository(MongoDatabase database, SchemaInitializer schemaInitializer,
            OwnershipResolver ownershipResolver, IngestionCounters counters) {
        this.collection = database.getCollection(SchemaInitializer.MEASUREMENTS);
        this.schemaInitializer = schemaInitializer;
        this.ownershipResolver = ownershipResolver;
        this.counters = counters;
    }

    @Override
    public SaveResult save(Measurement measurement) {
        schemaInitializer.ensureReady();
        Measurement toStore = resolveOwnership(measurement);
        try {
            collection.insertOne(MeasurementMapper.toDocument(toStore));
            return SaveResult.SAVED;
        } catch (MongoWriteException e) {
            if (e.getError().getCategory() != ErrorCategory.DUPLICATE_KEY) {
                throw e;
            }
            duplicatesRejected.incrementAndGet();
            LOG.info("Duplicate measurement rejected: deviceId=" + measurement.deviceId()
                    + ", sequence=" + measurement.sequence());
            return SaveResult.DUPLICATE;
        }
    }

    private Measurement resolveOwnership(Measurement measurement) {
        if (ownershipResolver == null) {
            return measurement;
        }
        OwnershipResolution resolution = ownershipResolver.resolve(measurement);
        if (resolution.unowned() && counters != null) {
            counters.unowned();
        }
        if (resolution.conflict() && counters != null) {
            counters.ownershipConflict();
        }
        String patientId = resolution.patientId().orElse(null);
        if (patientId == null ? measurement.patientId() == null : patientId.equals(measurement.patientId())) {
            return measurement;
        }
        return new Measurement(
                measurement.deviceId(),
                measurement.bootId(),
                measurement.sequence(),
                measurement.acquiredAt(),
                measurement.receivedAt(),
                measurement.heartRate(),
                measurement.spo2(),
                measurement.quality(),
                measurement.reason(),
                measurement.clockStatus(),
                measurement.source(),
                patientId,
                measurement.schemaVersion());
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
