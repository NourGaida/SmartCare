package com.smartcare.api.auth;

import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoDatabase;
import com.smartcare.api.PatientMeasurementsResource;
import com.smartcare.iam.auth.AuthService;
import com.smartcare.iam.auth.Pbkdf2PasswordHasher;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import com.smartcare.iam.session.SessionSettings;
import com.smartcare.persistence.LoginAttemptRepository;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import com.smartcare.persistence.SessionRepository;
import com.smartcare.persistence.UserRepository;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.bson.Document;
import org.junit.jupiter.api.*;

import java.io.StringReader;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

// Real MongoDB, login, cookie session loading, security filter and resource JSON.
// Only the JAX-RS request context is an in-memory boundary; no HTTP server is started.
class PatientMeasurementsResourceTest {

    private static MongoClient client;
    private static MongoDatabase database;
    private SessionService sessions;
    private SessionRepository sessionRepository;
    private MeasurementRepository measurements;
    private PatientMeasurementsResource resource;
    private SecurityFilter filter;
    private Session patientA;
    private Session patientB;

    @BeforeAll
    static void connect() {
        client = MongoClients.create(MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString("mongodb://localhost:27017"))
                .applyToClusterSettings(b -> b.serverSelectionTimeout(2, TimeUnit.SECONDS)).build());
        try { client.getDatabase("admin").runCommand(new Document("ping", 1)); }
        catch (RuntimeException e) { Assumptions.abort("MongoDB not reachable at localhost:27017"); }
        // Never touch the application DB or the databases used by other test classes.
        database = client.getDatabase("smartcare_test_history_" + UUID.randomUUID().toString().replace("-", ""));
    }

    @AfterAll
    static void close() {
        try { if (database != null) database.drop(); }
        finally { if (client != null) client.close(); }
    }

    @BeforeEach
    void seed() {
        database.drop();
        MongoProvider provider = new MongoProvider() {
            @Override public MongoDatabase database() { return database; }
        };
        SchemaInitializer schema = new SchemaInitializer(provider);
        schema.ensureReady();
        measurements = new MeasurementRepository(provider, schema, null, null);
        resource = new PatientMeasurementsResource(measurements);
        sessionRepository = new SessionRepository(database);
        sessions = new SessionService(sessionRepository, new SessionSettings(30, 8, false, "SMARTCARE_SESSION"));
        filter = new SecurityFilter();
        filter.sessionService = sessions;

        var users = new UserRepository(database);
        var hasher = new Pbkdf2PasswordHasher();
        String hash = hasher.hash("fictional-history-password");
        for (String id : List.of("patient-A", "patient-B")) {
            users.insert(new Document("userId", id).append("email", id.toLowerCase() + "@example.test")
                    .append("passwordHash", hash).append("role", "PATIENT")
                    .append("active", true).append("createdAt", new Date()));
        }
        var auth = new AuthService(users, new LoginAttemptRepository(database), hasher, sessions);
        patientA = auth.login("patient-a@example.test", "fictional-history-password", "127.0.0.1");
        patientB = auth.login("patient-b@example.test", "fictional-history-password", "127.0.0.1");

        // Interleaved owners, inserted out of time order. A previously reassigned device
        // occurs for both patients; deviceId alone must never determine access.
        save("patient-A", 4, false);
        save("patient-B", 3, true);
        save(null, 5, false);
        save("patient-A", 1, false);
        save("patient-B", 2, false);
    }

    private void save(String owner, long sequence, boolean invalid) {
        Instant acquired = Instant.parse("2026-11-17T12:00:00Z").plusSeconds(sequence);
        measurements.save(new Measurement("shared-device", "history-boot", sequence,
                acquired, acquired.plusMillis(250), invalid ? null : 70 + (int) sequence,
                invalid ? null : 98, invalid ? "invalid" : "good", invalid ? "no_finger" : null,
                "synced", "simulated", owner, 1));
    }

    @Test
    void eachAuthenticatedPatientReceivesOnlyTheirOwnMongoMeasurementsInTimeOrder() throws Exception {
        JsonObject a = body(get(patientA.sessionId(), null));
        JsonObject b = body(get(patientB.sessionId(), null));
        var aRows = a.getJsonArray("measurements");
        var bRows = b.getJsonArray("measurements");
        assertEquals(2, aRows.size());
        assertEquals(2, bRows.size());
        assertEquals(List.of(71, 74), aRows.stream().map(v -> v.asJsonObject().getInt("heartRate")).toList());
        assertEquals("2026-11-17T12:00:02Z", bRows.getJsonObject(0).getString("acquiredAtUtc"));
        assertEquals(72, bRows.getJsonObject(0).getInt("heartRate"));
        assertEquals("2026-11-17T12:00:04Z", aRows.getJsonObject(1).getString("acquiredAtUtc"));
        assertFalse(a.toString().contains("no_finger"));
        JsonObject invalid = bRows.getJsonObject(1);
        assertTrue(invalid.isNull("heartRate"));
        assertTrue(invalid.isNull("spo2"));
        assertEquals("invalid", invalid.getString("quality"));
        assertEquals("no_finger", invalid.getString("reason"));
        assertEquals("simulated", invalid.getString("source"));
        for (var value : aRows) {
            JsonObject row = value.asJsonObject();
            assertEquals(98, row.getInt("spo2"));
            assertEquals("good", row.getString("quality"));
            assertTrue(row.isNull("reason"));
            assertEquals("shared-device", row.getString("deviceId"));
            assertFalse(row.containsKey("patientId"));
            assertFalse(row.containsKey("_id"));
        }
    }

    @Test
    void forgedPatientAndUserQueryIdentifiersCannotChangeTheSessionOwner() throws Exception {
        assertEquals(body(get(patientA.sessionId(), null)),
                body(get(patientA.sessionId(), "patient-B")));
        assertEquals(body(get(patientB.sessionId(), null)),
                body(get(patientB.sessionId(), "patient-A")));
    }

    @Test
    void patientWithoutMeasurementsReceivesAnEmptyListNeverUnownedData() throws Exception {
        Session empty = sessions.create("patient-empty", "PATIENT");
        assertTrue(body(get(empty.sessionId(), null)).getJsonArray("measurements").isEmpty());
    }

    @Test
    void missingUnknownExpiredAndRevokedCookiesAreUnauthorized() throws Exception {
        Instant past = Instant.now().minusSeconds(3600);
        sessionRepository.save("expired", "patient-A", "PATIENT", "csrf", past, past, past);
        sessions.delete(patientB.sessionId());
        for (String cookie : new String[] { null, "does-not-exist", "expired", patientB.sessionId() }) {
            Response response = get(cookie, "patient-A");
            assertEquals(401, response.getStatus());
            assertEquals("unauthorized", parse(response).getString("error"));
            assertFalse(parse(response).containsKey("measurements"));
        }
    }

    @Test
    void professionalAndAdministratorCannotUseThePatientHistoryRoute() throws Exception {
        for (String role : List.of("PROFESSIONAL", "ADMIN")) {
            Session actor = sessions.create("patient-A", role);
            Response response = get(actor.sessionId(), "patient-B");
            assertEquals(403, response.getStatus());
            assertEquals("forbidden", parse(response).getString("error"));
            assertFalse(parse(response).containsKey("measurements"));
            assertEquals("no-store", response.getHeaderString("Cache-Control"));
        }
    }

    @Test
    void resourceFailsClosedWithoutTheFilterSessionAndRepositoryRejectsEmptyOwners() {
        Request request = new Request(patientA.sessionId(), "patient-A");
        assertEquals(401, resource.get(request.servlet).getStatus());
        assertThrows(IllegalArgumentException.class, () -> measurements.findByPatientId(null));
        assertThrows(IllegalArgumentException.class, () -> measurements.findByPatientId(" "));
    }

    @Test
    void unavailableMongoReturns503WithoutDataOrDatabaseDetails() throws Exception {
        Request request = new Request(patientA.sessionId(), null);
        filter.filter(request.context);
        MongoProvider unreachable = new MongoProvider("mongodb://127.0.0.1:1", 200);
        try {
            var repository = new MeasurementRepository(unreachable, new SchemaInitializer(unreachable), null, null);
            Response response = new PatientMeasurementsResource(repository).get(request.servlet);
            assertEquals(503, response.getStatus());
            assertEquals("measurements_unavailable", parse(response).getString("error"));
            assertFalse(parse(response).containsKey("measurements"));
            assertFalse(response.getEntity().toString().contains("mongodb"));
            assertEquals("no-store", response.getHeaderString("Cache-Control"));
        } finally { unreachable.close(); }
    }

    private Response get(String cookie, String forgedPatient) throws Exception {
        Request request = new Request(cookie, forgedPatient);
        filter.filter(request.context);
        return request.aborted == null ? resource.get(request.servlet) : request.aborted;
    }

    private static JsonObject body(Response response) {
        assertEquals(200, response.getStatus(), response.getEntity().toString());
        assertEquals(MediaType.APPLICATION_JSON_TYPE, response.getMediaType());
        assertEquals("no-store", response.getHeaderString("Cache-Control"));
        return parse(response);
    }

    private static JsonObject parse(Response response) {
        try (var reader = Json.createReader(new StringReader(response.getEntity().toString()))) {
            return reader.readObject();
        }
    }

    private static class Request {
        final Map<String, Object> properties = new HashMap<>();
        final ContainerRequestContext context;
        final HttpServletRequest servlet;
        Response aborted;

        Request(String cookie, String forgedPatient) {
            // In a servlet deployment, JAX-RS properties and servlet attributes share a bag.
            servlet = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
                    new Class<?>[] { HttpServletRequest.class }, (proxy, method, args) -> switch (method.getName()) {
                        case "getAttribute" -> properties.get(args[0]);
                        default -> throw new UnsupportedOperationException(method.getName());
                    });
            var query = new MultivaluedHashMap<String, String>();
            if (forgedPatient != null) {
                query.add("patientId", forgedPatient);
                query.add("userId", forgedPatient);
            }
            UriInfo uri = (UriInfo) Proxy.newProxyInstance(UriInfo.class.getClassLoader(), new Class<?>[] { UriInfo.class },
                    (proxy, method, args) -> switch (method.getName()) {
                        case "getPath" -> "me/measurements";
                        case "getQueryParameters" -> query;
                        case "getRequestUri" -> URI.create("http://localhost/smartcare/api/me/measurements" +
                                (forgedPatient == null ? "" : "?patientId=" + forgedPatient + "&userId=" + forgedPatient));
                        default -> throw new UnsupportedOperationException(method.getName());
                    });
            context = (ContainerRequestContext) Proxy.newProxyInstance(ContainerRequestContext.class.getClassLoader(),
                    new Class<?>[] { ContainerRequestContext.class }, (proxy, method, args) -> switch (method.getName()) {
                        case "getUriInfo" -> uri;
                        case "getMethod" -> "GET";
                        case "getCookies" -> cookie == null ? Map.of() : Map.of("SMARTCARE_SESSION", new Cookie("SMARTCARE_SESSION", cookie));
                        case "getProperty" -> properties.get(args[0]);
                        case "setProperty" -> properties.put((String) args[0], args[1]);
                        case "abortWith" -> { aborted = (Response) args[0]; yield null; }
                        default -> throw new UnsupportedOperationException(method.getName());
                    });
        }
    }
}
