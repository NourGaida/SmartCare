package com.smartcare.iam.session;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.smartcare.persistence.SessionRepository;
import org.bson.Document;
import org.junit.jupiter.api.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.*;

class SessionServiceTest {

    static MongoClient client;
    static MongoDatabase db;

    @BeforeAll
    static void setup() {
        client = com.mongodb.client.MongoClients.create(com.mongodb.MongoClientSettings.builder()
                .applyConnectionString(new com.mongodb.ConnectionString("mongodb://localhost:27017"))
                .applyToClusterSettings(b -> b.serverSelectionTimeout(2000, java.util.concurrent.TimeUnit.MILLISECONDS))
                .build());
        try { client.getDatabase("admin").runCommand(new Document("ping", 1)); }
        catch (Exception e) { Assumptions.abort("MongoDB not reachable"); }
        db = client.getDatabase("smartcare_test_auth");
    }

    @AfterAll
    static void tearDown() { if (client != null) client.close(); }

    @BeforeEach
    void clean() { db.drop(); }

    @Test
    void createAndLoadSession() {
        SessionRepository repo = new SessionRepository(db);
        SessionService svc = new SessionService(repo, new SessionSettings(30, 8, false, "SMARTCARE_SESSION"));
        Session s = svc.create("u1", "PATIENT");
        assertNotNull(s.sessionId());
        assertNotNull(s.csrfToken());
        assertTrue(s.sessionId().length() >= 22);
        var loaded = svc.load(s.sessionId());
        assertTrue(loaded.isPresent());
        assertEquals("u1", loaded.get().userId());
        assertEquals(s.csrfToken(), loaded.get().csrfToken());
    }

    @Test
    void expiredSessionReturnsEmptyAndIsDeleted() {
        SessionRepository repo = new SessionRepository(db);
        SessionService svc = new SessionService(repo, new SessionSettings(30, 8, false, "SMARTCARE_SESSION"));
        Instant past = Instant.now().minus(1, ChronoUnit.HOURS);
        repo.save("sid", "u1", "PATIENT", "csrf", past.minus(2, ChronoUnit.HOURS), past.minus(2, ChronoUnit.HOURS), past);
        assertTrue(svc.load("sid").isEmpty());
        assertTrue(repo.findById("sid").isEmpty());
    }

    @Test
    void logoutDeletesSession() {
        SessionRepository repo = new SessionRepository(db);
        SessionService svc = new SessionService(repo, SessionSettings.defaults());
        Session s = svc.create("u1", "PATIENT");
        svc.delete(s.sessionId());
        assertTrue(svc.load(s.sessionId()).isEmpty());
    }
}
