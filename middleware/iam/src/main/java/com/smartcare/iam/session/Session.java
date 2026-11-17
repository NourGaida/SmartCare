package com.smartcare.iam.session;

import java.time.Instant;

public record Session(String sessionId, String userId, String role, String csrfToken,
                      Instant createdAt, Instant lastAccessAt, Instant expiresAt) {
}
