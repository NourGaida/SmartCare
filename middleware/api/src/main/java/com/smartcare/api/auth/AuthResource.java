package com.smartcare.api.auth;

import com.mongodb.MongoException;
import com.smartcare.iam.auth.AuthService;
import com.smartcare.iam.auth.LoginException;
import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonException;
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
    @Path("/signup")
    public Response signup(String body) {
        if (body == null || body.length() > 4096) {
            return signupError(400, "invalid_request", "Enter your name, email and password.");
        }
        try (JsonReader reader = Json.createReader(new StringReader(body))) {
            JsonObject input = reader.readObject();
            String id = authService.registerPatient(input.getString("name", null),
                    input.getString("email", null), input.getString("password", null));
            return Response.status(201).header("Cache-Control", "no-store")
                    .entity(Json.createObjectBuilder().add("userId", id).add("role", "PATIENT").build().toString()).build();
        } catch (JsonException | ClassCastException error) {
            return signupError(400, "invalid_request", "Enter your name, email and password.");
        } catch (LoginException error) {
            return signupError(error.status(), error.code(), error.getMessage());
        } catch (MongoException error) {
            return signupError(503, "signup_unavailable", "Registration is unavailable. Please try again.");
        }
    }

    private static Response signupError(int status, String code, String message) {
        return Response.status(status).header("Cache-Control", "no-store").entity(Json.createObjectBuilder()
                .add("error", code).add("message", message).build().toString()).build();
    }

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
