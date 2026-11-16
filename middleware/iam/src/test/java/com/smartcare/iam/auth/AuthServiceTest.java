package com.smartcare.iam.auth;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.smartcare.iam.session.SessionService;
import com.smartcare.iam.session.SessionSettings;
import com.smartcare.persistence.LoginAttemptRepository;
import com.smartcare.persistence.SessionRepository;
import com.smartcare.persistence.UserRepository;
import org.bson.Document;
import org.junit.jupiter.api.*;

import java.util.Date;

import static org.junit.jupiter.api.Assertions.*;

class AuthServiceTest {

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

    private AuthService service() {
        UserRepository users = new UserRepository(db);
        LoginAttemptRepository attempts = new LoginAttemptRepository(db);
        SessionRepository sessions = new SessionRepository(db);
        SessionService sessionService = new SessionService(sessions, SessionSettings.defaults());
        return new AuthService(users, attempts, new Pbkdf2PasswordHasher(), sessionService);
    }

    private void seedUser(String userId, String email, String password, boolean active, String role) {
        PasswordHasher hasher = new Pbkdf2PasswordHasher();
        db.getCollection("users").insertOne(new Document("userId", userId)
                .append("email", email.toLowerCase())
                .append("passwordHash", hasher.hash(password))
                .append("role", role)
                .append("active", active)
                .append("createdAt", new Date()));
    }

    @Test
    void loginSucceedsWithCorrectCredentials() {
        seedUser("p1", "p1@example.com", "secret", true, "PATIENT");
        var s = service().login("p1@example.com", "secret", "1.2.3.4");
        assertEquals("p1", s.userId());
        assertEquals("PATIENT", s.role());
        assertNotNull(s.csrfToken());
    }

    @Test
    void wrongPasswordSameErrorAsUnknownEmail() {
        seedUser("p1", "p1@example.com", "secret", true, "PATIENT");
        AuthService svc = service();
        LoginException wrong = assertThrows(LoginException.class, () -> svc.login("p1@example.com", "bad", "1.2.3.4"));
        LoginException unknown = assertThrows(LoginException.class, () -> svc.login("nobody@example.com", "bad", "1.2.3.5"));
        assertEquals(401, wrong.status());
        assertEquals(401, unknown.status());
        assertEquals(wrong.code(), unknown.code());
        assertEquals(wrong.getMessage(), unknown.getMessage());
    }

    @Test
    void inactiveUserRefusedWithSameError() {
        seedUser("p1", "p1@example.com", "secret", false, "PATIENT");
        LoginException ex = assertThrows(LoginException.class, () -> service().login("p1@example.com", "secret", "1.2.3.4"));
        assertEquals(401, ex.status());
        assertEquals("invalid_credentials", ex.code());
    }

    @Test
    void attemptLimitPerAccountTriggers429() {
        seedUser("p1", "p1@example.com", "secret", true, "PATIENT");
        AuthService svc = service();
        for (int i = 0; i < 5; i++) {
            final int idx = i;
            assertThrows(LoginException.class, () -> svc.login("p1@example.com", "bad", "1.2.3." + idx));
        }
        LoginException ex = assertThrows(LoginException.class, () -> svc.login("p1@example.com", "secret", "9.9.9.9"));
        assertEquals(429, ex.status());
    }

    @Test
    void logoutKillsSession() {
        seedUser("p1", "p1@example.com", "secret", true, "PATIENT");
        AuthService svc = service();
        var s = svc.login("p1@example.com", "secret", "1.2.3.4");
        svc.logout(s.sessionId());
        SessionService sessions = new SessionService(new SessionRepository(db), SessionSettings.defaults());
        assertTrue(sessions.load(s.sessionId()).isEmpty());
    }
}
