package com.smartcare.iam.session;

import com.smartcare.persistence.SessionRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.bson.Document;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

@ApplicationScoped
public class SessionService {

    private final SessionRepository repository;
    private final SessionSettings settings;

    protected SessionService() { this.repository = null; this.settings = SessionSettings.defaults(); }

    @Inject
    public SessionService(SessionRepository repository) {
        this(repository, SessionSettings.defaults());
    }

    public SessionService(SessionRepository repository, SessionSettings settings) {
        this.repository = repository;
        this.settings = settings == null ? SessionSettings.defaults() : settings;
    }

    public Session create(String userId, String role) {
        Instant now = Instant.now();
        Instant expiresAt = earliest(now.plus(Duration.ofMinutes(settings.idleMinutes())),
                now.plus(Duration.ofHours(settings.absoluteHours())));
        String sessionId = TokenGenerator.randomToken(16);
        String csrf = TokenGenerator.randomToken(16);
        repository.save(sessionId, userId, role, csrf, now, now, expiresAt);
        return new Session(sessionId, userId, role, csrf, now, now, expiresAt);
    }

    public Optional<Session> load(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return Optional.empty();
        Optional<Document> docOpt = repository.findById(sessionId);
        if (docOpt.isEmpty()) return Optional.empty();
        Document d = docOpt.get();
        Instant now = Instant.now();
        Instant createdAt = toInstant(d.get("createdAt"));
        Instant expiresAt = toInstant(d.get("expiresAt"));
        Instant absoluteEnd = createdAt.plus(Duration.ofHours(settings.absoluteHours()));
        if (expiresAt.isBefore(now) || !absoluteEnd.isAfter(now)) {
            repository.deleteById(sessionId);
            return Optional.empty();
        }
        Instant newExpiry = earliest(now.plus(Duration.ofMinutes(settings.idleMinutes())), absoluteEnd);
        repository.touch(sessionId, now, newExpiry);
        return Optional.of(new Session(d.getString("sessionId"), d.getString("userId"), d.getString("role"),
                d.getString("csrfToken"), createdAt, now, newExpiry));
    }

    public void delete(String sessionId) { repository.deleteById(sessionId); }
    public void deleteByUserId(String userId) { repository.deleteByUserId(userId); }
    public SessionSettings settings() { return settings; }

    private static Instant toInstant(Object v) {
        if (v instanceof Date dt) return dt.toInstant();
        if (v instanceof Instant i) return i;
        return Instant.EPOCH;
    }
    private static Instant earliest(Instant a, Instant b) { return a.isBefore(b) ? a : b; }
}
