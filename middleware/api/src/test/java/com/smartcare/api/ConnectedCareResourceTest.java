package com.smartcare.api;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import com.smartcare.api.auth.SecurityFilter;
import com.smartcare.iam.session.Session;
import com.smartcare.ingestion.DetectionEventHandler;
import com.smartcare.persistence.AlertRepository;
import com.smartcare.persistence.CareRepository;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import com.smartcare.persistence.SimulationRunRepository;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.core.Response;
import org.bson.Document;
import org.junit.jupiter.api.*;

import java.io.StringReader;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static com.mongodb.client.model.Filters.eq;
import static org.junit.jupiter.api.Assertions.*;

class ConnectedCareResourceTest {
    private static final Instant TIME = Instant.parse("2026-11-23T12:00:00Z");
    private static final String P1 = "patient-1";
    private static final String P2 = "patient-2";
    private static MongoClient client;
    private static MongoDatabase database;
    private MeasurementRepository measurements;
    private DetectionEventHandler detector;
    private CareResource resource;

    @BeforeAll
    static void connect() {
        client = MongoClients.create(MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString("mongodb://localhost:27017"))
                .applyToClusterSettings(settings -> settings.serverSelectionTimeout(2, TimeUnit.SECONDS)).build());
        try { client.getDatabase("admin").runCommand(new Document("ping", 1)); }
        catch (RuntimeException error) { Assumptions.abort("MongoDB not reachable at localhost:27017"); }
        database = client.getDatabase("smartcare_test_care_" + UUID.randomUUID().toString().replace("-", ""));
    }

    @AfterAll
    static void close() {
        try { if (database != null) database.drop(); }
        finally { if (client != null) client.close(); }
    }

    @BeforeEach
    void seedPatients() {
        database.drop();
        MongoProvider provider = new MongoProvider() {
            @Override public MongoDatabase database() { return database; }
        };
        var schema = new SchemaInitializer(provider);
        schema.ensureReady();
        var alerts = new AlertRepository(database);
        measurements = new MeasurementRepository(provider, schema, null, null);
        detector = new DetectionEventHandler(measurements, alerts);
        resource = new CareResource(new CareRepository(database), measurements, alerts,
                new SimulationService(measurements, new SimulationRunRepository(database)));
        for (String patient : new String[] {P1, P2}) {
            database.getCollection("users").insertOne(new Document("userId", patient)
                    .append("email", patient + "@smartcare.invalid").append("displayName", patient)
                    .append("passwordHash", "unused-fixture").append("role", "PATIENT")
                    .append("active", true).append("createdAt", Date.from(TIME)));
        }
        database.getCollection("assignments").insertOne(new Document("professionalId", "staff")
                .append("patientId", P1).append("createdAt", Date.from(TIME)));
        save(P1, "sensor-1", 1, 93);
        save(P2, "sensor-2", 1, 99);
    }

    @Test
    void professionalOnlyReceivesAssignedPatientsAndRevocationTakesEffectOnNextRequest() {
        var staff = session("staff", "PROFESSIONAL");
        Response assigned = resource.patients(staff);
        assertEquals(200, assigned.getStatus());
        assertEquals("no-store", assigned.getHeaderString("Cache-Control"));
        assertEquals(1, json(assigned).getJsonArray("patients").size());
        assertEquals(93, json(resource.patientMeasurements(staff, P1)).getJsonArray("measurements").getJsonObject(0).getInt("spo2"));
        assertEquals(403, resource.patientMeasurements(staff, P2).getStatus());
        assertEquals(403, resource.patientAlerts(staff, P2).getStatus());
        assertEquals(403, resource.patients(session("admin", "ADMIN")).getStatus());
        assertEquals(401, resource.patients(session(null, null)).getStatus());
        database.getCollection("assignments").deleteOne(eq("professionalId", "staff"));
        assertEquals(403, resource.patientMeasurements(staff, P1).getStatus());
    }

    @Test
    void onlyConfirmedEventsCreateAnAlertAndMongoAcknowledgementSurvivesFreshReads() {
        var staff = session("staff", "PROFESSIONAL");
        String alertId = UUID.randomUUID().toString();
        deliver(alertId, "ANOMALY_STARTED", "sensor-1", 1);
        deliver(alertId, "SUSTAINED_ANOMALY_CONFIRMED", "sensor-missing", 1);
        assertTrue(json(resource.patientAlerts(staff, P1)).getJsonArray("alerts").isEmpty());
        deliver(alertId, "SUSTAINED_ANOMALY_CONFIRMED", "sensor-1", 1);
        deliver(alertId, "SUSTAINED_ANOMALY_CONFIRMED", "sensor-1", 1);
        assertEquals(1, json(resource.patientAlerts(staff, P1)).getJsonArray("alerts").size());
        assertTrue(json(resource.myAlerts(session(P2, "PATIENT"))).getJsonArray("alerts").isEmpty());
        assertEquals(403, resource.acknowledge(session(P1, "PATIENT"), P1, alertId, "{\"note\":\"OK\"}").getStatus());
        assertEquals(400, resource.acknowledge(staff, P1, alertId, "{\"note\":\" \"}").getStatus());
        assertEquals(200, resource.acknowledge(staff, P1, alertId, "{\"note\":\"Reviewed\"}").getStatus());
        assertEquals(200, resource.acknowledge(staff, P1, alertId, "{\"note\":\"Replay\"}").getStatus());
        JsonObject fresh = json(resource.patientAlerts(staff, P1)).getJsonArray("alerts").getJsonObject(0);
        assertEquals("Reviewed", fresh.getString("note"));
        assertEquals("open", fresh.getString("status"));
        assertFalse(fresh.isNull("acknowledgedAt"));
        assertFalse(json(resource.myAlerts(session(P1, "PATIENT"))).getJsonArray("alerts").getJsonObject(0).containsKey("note"));
        save(P1, "sensor-1", 2, 98);
        deliver(UUID.randomUUID().toString(), "ANOMALY_RESOLVED", "sensor-1", 2);
        JsonObject resolved = json(resource.patientAlerts(staff, P1)).getJsonArray("alerts").getJsonObject(0);
        assertEquals("resolved", resolved.getString("status"));
        assertEquals(fresh.getString("acknowledgedAt"), resolved.getString("acknowledgedAt"));
    }

    private void save(String patient, String device, long sequence, int spo2) {
        var at = TIME.plusSeconds(sequence);
        measurements.save(new Measurement(device, "boot-a", sequence, at, at,
                75, spo2, "good", null, "synced", "simulated", patient, 1));
    }

    private void deliver(String id, String type, String device, long sequence) {
        var event = Json.createObjectBuilder().add("schemaVersion", 1).add("eventId", id)
                .add("eventType", type).add("source", "smartcare-detector").add("anomalyType", "LOW_SPO2")
                .add("deviceId", device).add("bootId", "boot-a").add("sequence", sequence).add("patientId", P2);
        detector.handle(event.build().toString().getBytes(StandardCharsets.UTF_8));
    }

    private static JsonObject json(Response response) {
        try (var reader = Json.createReader(new StringReader(response.getEntity().toString()))) {
            return reader.readObject();
        }
    }

    private static HttpServletRequest session(String userId, String role) {
        Session session = userId == null ? null : new Session("session", userId, role, "csrf", TIME, TIME, TIME.plusSeconds(60));
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, (proxy, method, args) -> {
                    if (method.getName().equals("getAttribute") && SecurityFilter.SESSION_ATTR.equals(args[0])) return session;
                    throw new UnsupportedOperationException(method.getName());
                });
    }
}
