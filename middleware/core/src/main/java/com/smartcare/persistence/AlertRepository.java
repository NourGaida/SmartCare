package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.ReturnDocument;
import com.mongodb.client.model.UpdateOptions;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static com.mongodb.client.model.Filters.*;
import static com.mongodb.client.model.Sorts.*;
import static com.mongodb.client.model.Updates.*;

@ApplicationScoped
public class AlertRepository {
    public static final String COLLECTION = "alerts";
    private final MongoCollection<Document> alerts;

    protected AlertRepository() { this.alerts = null; }

    @Inject
    public AlertRepository(MongoProvider provider) { this(provider.database()); }

    public AlertRepository(MongoDatabase database) {
        alerts = database.getCollection(COLLECTION);
        alerts.createIndex(orderBy(ascending("patientId"), descending("confirmedAt")),
                new IndexOptions().name("ix_alert_patient_time"));
    }

    public void confirm(String eventId, String anomalyType, Measurement measurement, Instant startedAt) {
        var fields = new Document("patientId", measurement.patientId())
                .append("deviceId", measurement.deviceId())
                .append("bootId", measurement.bootId())
                .append("confirmedSequence", measurement.sequence())
                .append("confirmedAt", Date.from(measurement.acquiredAt()))
                .append("anomalyType", anomalyType)
                .append("source", "rule-detector");
        if (startedAt != null) fields.append("startedAt", Date.from(startedAt));
        alerts.updateOne(eq("_id", eventId), new Document("$setOnInsert", fields), new UpdateOptions().upsert(true));
    }

    public void resolve(String anomalyType, Measurement measurement) {
        var scope = and(eq("patientId", measurement.patientId()), eq("deviceId", measurement.deviceId()),
                eq("bootId", measurement.bootId()), eq("anomalyType", anomalyType),
                lt("confirmedSequence", measurement.sequence()));
        // A replay must still target the same alert, even if it is already resolved.
        Document latest = alerts.find(scope).sort(descending("confirmedSequence")).first();
        if (latest != null) {
            alerts.updateOne(and(eq("_id", latest.getString("_id")), eq("resolvedAt", null)),
                    set("resolvedAt", Date.from(measurement.acquiredAt())));
        }
    }

    public List<Document> forPatient(String patientId) {
        return alerts.find(eq("patientId", patientId)).sort(descending("confirmedAt")).into(new ArrayList<>());
    }

    public long countOpen(String patientId) {
        return alerts.countDocuments(and(eq("patientId", patientId), eq("resolvedAt", null)));
    }

    public long countUnacknowledged(String patientId) {
        return alerts.countDocuments(and(eq("patientId", patientId), eq("acknowledgedAt", null)));
    }

    public Optional<Document> acknowledge(String patientId, String alertId, String professionalId, String note) {
        var scope = and(eq("_id", alertId), eq("patientId", patientId));
        Document row = alerts.findOneAndUpdate(and(scope, eq("acknowledgedAt", null)),
                combine(set("acknowledgedAt", Date.from(Instant.now())), set("acknowledgedBy", professionalId),
                        set("note", note)), new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER));
        return Optional.ofNullable(row == null ? alerts.find(scope).first() : row);
    }
}
