package com.smartcare.api.auth;

import com.smartcare.iam.auth.AuthService;
import com.smartcare.iam.auth.LoginException;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.io.StringReader;

@Path("/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject AuthService authService;
    @Inject SessionService sessionService;

    @POST
    @Path("/login")
    public Response login(String body, @Context HttpServletRequest request) {
        String email = null, password = null;
        try (JsonReader r = Json.createReader(new StringReader(body == null ? "{}" : body))) {
            JsonObject o = r.readObject();
            email = o.containsKey("email") && !o.isNull("email") ? o.getString("email") : null;
            password = o.containsKey("password") && !o.isNull("password") ? o.getString("password") : null;
        } catch (Exception ignored) {}
        try {
            String ip = request == null ? "unknown" : request.getRemoteAddr();
            Session s = authService.login(email, password, ip);
            NewCookie cookie = buildCookie(s.sessionId(), (int) java.time.Duration.between(java.time.Instant.now(), s.expiresAt()).getSeconds());
            String json = Json.createObjectBuilder()
                    .add("userId", s.userId())
                    .add("role", s.role())
                    .add("csrfToken", s.csrfToken()).build().toString();
            return Response.ok(json).cookie(cookie).build();
        } catch (LoginException e) {
            String json = Json.createObjectBuilder().add("error", e.code()).add("message", e.getMessage()).build().toString();
            return Response.status(e.status()).entity(json).type(MediaType.APPLICATION_JSON).build();
        }
    }

    @POST
    @Path("/logout")
    public Response logout(@CookieParam("SMARTCARE_SESSION") String sessionId) {
        if (sessionId != null) authService.logout(sessionId);
        NewCookie expired = buildCookie("", 0);
        return Response.noContent().cookie(expired).build();
    }

    private NewCookie buildCookie(String value, int maxAge) {
        var settings = sessionService.settings();
        return new NewCookie.Builder(settings.cookieName())
                .value(value)
                .path("/")
                .httpOnly(true)
                .secure(settings.secureCookie())
                .sameSite(NewCookie.SameSite.STRICT)
                .maxAge(maxAge)
                .build();
    }
}
