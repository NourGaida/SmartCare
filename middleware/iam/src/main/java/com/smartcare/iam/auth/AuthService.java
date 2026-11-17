package com.smartcare.iam.auth;

import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import com.smartcare.persistence.LoginAttemptRepository;
import com.smartcare.persistence.UserRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@ApplicationScoped
public class AuthService {

    static final int MAX_ATTEMPTS = 5;
    static final long WINDOW_MINUTES = 15;
    static final String INVALID_CREDENTIALS = "invalid_credentials";

    private final UserRepository users;
    private final LoginAttemptRepository attempts;
    private final PasswordHasher hasher;
    private final SessionService sessions;

    protected AuthService() { this.users=null; this.attempts=null; this.hasher=null; this.sessions=null; }

    @Inject
    public AuthService(UserRepository users, LoginAttemptRepository attempts, PasswordHasher hasher, SessionService sessions) {
        this.users = users; this.attempts = attempts; this.hasher = hasher; this.sessions = sessions;
    }

    public Session login(String email, String password, String clientIp) {
        String normEmail = email == null ? "" : email.trim().toLowerCase();
        String ip = clientIp == null ? "unknown" : clientIp;
        checkRate("email:" + normEmail);
        checkRate("ip:" + ip);

        Document userDoc = users.findByEmail(normEmail).orElse(null);
        // constant work: always verify against something
        String hash = userDoc == null ? hasher.hash("dummy-password") : userDoc.getString("passwordHash");
        boolean ok = hasher.verify(password == null ? "" : password, hash);
        boolean active = userDoc != null && Boolean.TRUE.equals(userDoc.getBoolean("active", false));
        if (userDoc == null || !ok || !active) {
            recordFailure("email:" + normEmail);
            recordFailure("ip:" + ip);
            throw new LoginException(401, INVALID_CREDENTIALS, "Invalid credentials");
        }
        attempts.reset("email:" + normEmail);
        attempts.reset("ip:" + ip);
        return sessions.create(userDoc.getString("userId"), userDoc.getString("role"));
    }

    private void checkRate(String key) {
        if (attempts.getCount(key) >= MAX_ATTEMPTS) {
            throw new LoginException(429, "too_many_attempts", "Too many login attempts");
        }
    }
    private void recordFailure(String key) {
        attempts.incrementAndGet(key, Instant.now().plus(WINDOW_MINUTES, ChronoUnit.MINUTES));
    }

    public void logout(String sessionId) { sessions.delete(sessionId); }
}
