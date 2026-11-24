package com.smartcare.iam.auth;

import com.mongodb.ErrorCategory;
import com.mongodb.MongoWriteException;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import com.smartcare.persistence.LoginAttemptRepository;
import com.smartcare.persistence.UserRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@ApplicationScoped
public class AuthService {

    static final int MAX_ATTEMPTS = 5;
    static final long WINDOW_MINUTES = 15;
    static final String INVALID_CREDENTIALS = "invalid_credentials";
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

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
        String normEmail = normalizeEmail(email);
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

    public String registerPatient(String name, String email, String password) {
        String displayName = name == null ? "" : name.strip();
        String normalizedEmail = normalizeEmail(email);
        if (displayName.length() < 2 || displayName.length() > 100
                || displayName.chars().anyMatch(Character::isISOControl)) {
            throw new LoginException(400, "invalid_name", "Enter a name of 2 to 100 characters.");
        }
        if (normalizedEmail.length() > 120 || !EMAIL.matcher(normalizedEmail).matches()) {
            throw new LoginException(400, "invalid_email", "Enter a valid email address.");
        }
        if (password == null || password.length() < 10 || password.length() > 100 || password.isBlank()) {
            throw new LoginException(400, "invalid_password", "Use a password of 10 to 100 characters.");
        }
        String userId = UUID.randomUUID().toString();
        try {
            users.insert(new Document("userId", userId)
                    .append("displayName", displayName)
                    .append("email", normalizedEmail)
                    .append("passwordHash", hasher.hash(password))
                    .append("role", "PATIENT")
                    .append("active", true)
                    .append("createdAt", Date.from(Instant.now())));
        } catch (MongoWriteException error) {
            if (error.getError().getCategory() == ErrorCategory.DUPLICATE_KEY) {
                throw new LoginException(409, "email_in_use", "This email is already registered.");
            }
            throw error;
        }
        return userId;
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
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
