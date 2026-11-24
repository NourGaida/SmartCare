package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.IndexOptions;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Instant;
import java.util.Date;
import java.util.Optional;

import static com.mongodb.client.model.Filters.and;
import static com.mongodb.client.model.Filters.eq;
import static com.mongodb.client.model.Sorts.ascending;
import static com.mongodb.client.model.Sorts.descending;
import static com.mongodb.client.model.Sorts.orderBy;
import static com.mongodb.client.model.Updates.combine;
import static com.mongodb.client.model.Updates.set;

@ApplicationScoped
public class SimulationRunRepository {
    private final MongoCollection<Document> runs;

    protected SimulationRunRepository() { runs = null; }

    @Inject
    public SimulationRunRepository(MongoProvider provider) { this(provider.database()); }

    public SimulationRunRepository(MongoDatabase database) {
        runs = database.getCollection("simulation_runs");
        runs.createIndex(orderBy(ascending("patientId"), descending("startedAt", "_id")),
                new IndexOptions().name("ix_simulation_patient_start"));
    }

    public void start(String id, String patientId, String deviceId, String scenario, int expected, Instant at) {
        runs.insertOne(new Document("_id", id).append("patientId", patientId).append("deviceId", deviceId)
                .append("scenario", scenario).append("expected", expected).append("startedAt", Date.from(at)));
    }

    public void finish(String id, int exitCode, Instant at) {
        runs.updateOne(eq("_id", id), combine(set("exitCode", exitCode), set("finishedAt", Date.from(at))));
    }

    public Optional<Run> find(String patientId, String id) {
        return Optional.ofNullable(runs.find(and(eq("_id", id), eq("patientId", patientId))).first())
                .map(SimulationRunRepository::fromDocument);
    }

    public Optional<Run> latest(String patientId, String deviceId) {
        var owner = eq("patientId", patientId);
        var filter = deviceId == null ? owner : and(owner, eq("deviceId", deviceId));
        return Optional.ofNullable(runs.find(filter).sort(descending("startedAt", "_id")).first())
                .map(SimulationRunRepository::fromDocument);
    }

    private static Run fromDocument(Document row) {
        Date finishedAt = row.getDate("finishedAt");
        return new Run(row.getString("_id"), row.getString("patientId"), row.getString("deviceId"),
                row.getString("scenario"), row.getInteger("expected"), row.getDate("startedAt").toInstant(),
                finishedAt == null ? null : finishedAt.toInstant(), row.getInteger("exitCode"));
    }

    public record Run(String id, String patientId, String deviceId, String scenario, int expected,
                      Instant startedAt, Instant finishedAt, Integer exitCode) {}
}
