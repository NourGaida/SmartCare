package com.smartcare.persistence;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static com.mongodb.client.model.Filters.*;
import static com.mongodb.client.model.Projections.excludeId;
import static com.mongodb.client.model.Projections.include;
import static com.mongodb.client.model.Projections.fields;
import static com.mongodb.client.model.Sorts.ascending;

@ApplicationScoped
public class CareRepository {
    private final MongoCollection<Document> assignments;
    private final MongoCollection<Document> users;
    private final MongoCollection<Document> devices;
    private final MongoCollection<Document> ownership;

    protected CareRepository() { this(null, null, null, null); }

    @Inject
    public CareRepository(MongoProvider provider) { this(provider.database()); }

    public CareRepository(MongoDatabase database) {
        this(database.getCollection(SchemaInitializer.ASSIGNMENTS), database.getCollection(SchemaInitializer.USERS),
                database.getCollection(SchemaInitializer.DEVICES), database.getCollection(SchemaInitializer.DEVICE_OWNERSHIP));
    }

    private CareRepository(MongoCollection<Document> assignments, MongoCollection<Document> users,
                           MongoCollection<Document> devices, MongoCollection<Document> ownership) {
        this.assignments = assignments;
        this.users = users;
        this.devices = devices;
        this.ownership = ownership;
    }

    public boolean isAssigned(String professionalId, String patientId) {
        return assignments.find(and(eq("professionalId", professionalId), eq("patientId", patientId)))
                .projection(include("_id")).first() != null;
    }

    public Optional<Patient> findPatient(String patientId) {
        Document row = users.find(and(eq("userId", patientId), eq("role", "PATIENT"), eq("active", true)))
                .projection(fields(excludeId(), include("userId", "displayName"))).first();
        return Optional.ofNullable(row).map(CareRepository::patient);
    }

    public List<Patient> assignedPatients(String professionalId) {
        List<String> ids = assignments.find(eq("professionalId", professionalId))
                .map(row -> row.getString("patientId")).into(new ArrayList<>());
        if (ids.isEmpty()) return List.of();
        List<Patient> patients = users.find(and(in("userId", ids), eq("role", "PATIENT"), eq("active", true)))
                .projection(fields(excludeId(), include("userId", "displayName")))
                .map(CareRepository::patient).into(new ArrayList<>());
        patients.sort(Comparator.comparing(Patient::name, String.CASE_INSENSITIVE_ORDER).thenComparing(Patient::id));
        return patients;
    }

    public List<Device> activeDevices(String patientId) {
        Date now = new Date();
        List<String> ids = ownership.find(and(eq("patientId", patientId), lte("validFrom", now),
                        or(eq("validTo", null), gt("validTo", now))))
                .map(row -> row.getString("deviceId")).into(new ArrayList<>());
        if (ids.isEmpty()) return List.of();
        return devices.find(and(in("deviceId", ids), eq("status", "ENROLLED")))
                .sort(ascending("deviceId"))
                .map(row -> new Device(row.getString("deviceId"), Boolean.TRUE.equals(row.getBoolean("simulationEnabled"))))
                .into(new ArrayList<>());
    }

    private static Patient patient(Document row) {
        String id = row.getString("userId");
        return new Patient(id, row.getString("displayName") == null ? id : row.getString("displayName"));
    }

    public record Patient(String id, String name) {}
    public record Device(String id, boolean simulationEnabled) {}
}
