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

    @Inject SessionService sessionService;

    @Override
    public void filter(ContainerRequestContext ctx) throws IOException {
        String path = ctx.getUriInfo().getPath();
        if (path == null) path = "";
        // public routes: health and login only
        if (path.equals("health") || path.startsWith("health/") || path.equals("auth/login")) {
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
        if (!SAFE.contains(ctx.getMethod())) {
            String token = ctx.getHeaderString("X-CSRF-Token");
            if (!Csrf.matches(session.csrfToken(), token)) {
                abort(ctx, 403, "csrf_invalid", "Invalid or missing CSRF token");
            }
        }
    }

    private static void abort(ContainerRequestContext ctx, int status, String code, String message) {
        String json = Json.createObjectBuilder().add("error", code).add("message", message).build().toString();
        ctx.abortWith(Response.status(status).type(MediaType.APPLICATION_JSON).entity(json).build());
    }
}
