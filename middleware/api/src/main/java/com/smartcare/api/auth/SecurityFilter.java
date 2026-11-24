package com.smartcare.api.auth;

import com.smartcare.iam.security.Csrf;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerRequestFilter;
import jakarta.ws.rs.core.Cookie;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.Provider;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

@Provider
@Priority(Priorities.AUTHENTICATION)
public class SecurityFilter implements ContainerRequestFilter {

    public static final String SESSION_ATTR = "smartcare.session";
    private static final Set<String> SAFE = Set.of("GET", "HEAD", "OPTIONS");
    private static final Set<String> PUBLIC_GET_PATHS = Set.of(
            "health", "health/database", "health/ingestion");
    private static final Set<String> PUBLIC_POST_PATHS = Set.of("auth/login", "auth/signup");

    @Inject SessionService sessionService;

    @Override
    public void filter(ContainerRequestContext ctx) throws IOException {
        String path = ctx.getUriInfo().getPath();
        String method = ctx.getMethod();
        if (isPublicRoute(path, method)) {
            return;
        }
        Cookie cookie = ctx.getCookies().get(sessionService.settings().cookieName());
        String sid = cookie == null ? null : cookie.getValue();
        Optional<Session> sessionOpt = sessionService.load(sid);
        if (sessionOpt.isEmpty()) {
            abort(ctx, 401, "unauthorized", "Not authenticated");
            return;
        }
        Session session = sessionOpt.get();
        ctx.setProperty(SESSION_ATTR, session);
        if (!SAFE.contains(method)) {
            String token = ctx.getHeaderString("X-CSRF-Token");
            if (!Csrf.matches(session.csrfToken(), token)) {
                abort(ctx, 403, "csrf_invalid", "Invalid or missing CSRF token");
            }
        }
    }

    static boolean isPublicRoute(String rawPath, String method) {
        String normalized = normalizePath(rawPath);
        if ("POST".equalsIgnoreCase(method) && PUBLIC_POST_PATHS.contains(normalized)) {
            return true;
        }
        if ("GET".equalsIgnoreCase(method) && PUBLIC_GET_PATHS.contains(normalized)) {
            return true;
        }
        return false;
    }

    static String normalizePath(String rawPath) {
        if (rawPath == null) {
            return "";
        }
        String p = rawPath;
        while (p.startsWith("/")) {
            p = p.substring(1);
        }
        while (p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p;
    }

    private static void abort(ContainerRequestContext ctx, int status, String code, String message) {
        String json = Json.createObjectBuilder().add("error", code).add("message", message).build().toString();
        try {
            ctx.abortWith(Response.status(status).type(MediaType.APPLICATION_JSON).entity(json).build());
        } catch (RuntimeException e) {
            ctx.abortWith(new SimpleJsonResponse(status, json));
        }
    }

    static final class SimpleJsonResponse extends Response {
        private final int status;
        private final Object entity;

        SimpleJsonResponse(int status, Object entity) {
            this.status = status;
            this.entity = entity;
        }

        @Override public int getStatus() { return status; }
        @Override public StatusType getStatusInfo() { return Status.fromStatusCode(status); }
        @Override public Object getEntity() { return entity; }
        @Override public <T> T readEntity(Class<T> entityType) { throw new UnsupportedOperationException(); }
        @Override public <T> T readEntity(jakarta.ws.rs.core.GenericType<T> entityType) { throw new UnsupportedOperationException(); }
        @Override public <T> T readEntity(Class<T> entityType, java.lang.annotation.Annotation[] annotations) { throw new UnsupportedOperationException(); }
        @Override public <T> T readEntity(jakarta.ws.rs.core.GenericType<T> entityType, java.lang.annotation.Annotation[] annotations) { throw new UnsupportedOperationException(); }
        @Override public boolean hasEntity() { return entity != null; }
        @Override public boolean bufferEntity() { return false; }
        @Override public void close() { }
        @Override public MediaType getMediaType() { return MediaType.APPLICATION_JSON_TYPE; }
        @Override public java.util.Locale getLanguage() { return null; }
        @Override public int getLength() { return -1; }
        @Override public java.util.Set<String> getAllowedMethods() { return Set.of(); }
        @Override public java.util.Map<String, jakarta.ws.rs.core.NewCookie> getCookies() { return java.util.Map.of(); }
        @Override public jakarta.ws.rs.core.EntityTag getEntityTag() { return null; }
        @Override public java.util.Date getDate() { return null; }
        @Override public java.util.Date getLastModified() { return null; }
        @Override public java.net.URI getLocation() { return null; }
        @Override public java.util.Set<jakarta.ws.rs.core.Link> getLinks() { return Set.of(); }
        @Override public boolean hasLink(String relation) { return false; }
        @Override public jakarta.ws.rs.core.Link getLink(String relation) { return null; }
        @Override public jakarta.ws.rs.core.Link.Builder getLinkBuilder(String relation) { return null; }
        @Override public MultivaluedMap<String, Object> getMetadata() { return new MultivaluedHashMap<>(); }
        @Override public MultivaluedMap<String, String> getStringHeaders() { return new MultivaluedHashMap<>(); }
        @Override public String getHeaderString(String name) { return null; }
    }
}
