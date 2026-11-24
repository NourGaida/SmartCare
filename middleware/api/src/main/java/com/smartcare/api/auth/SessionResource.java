package com.smartcare.api.auth;

import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import com.smartcare.persistence.UserRepository;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

@Path("/session")
@Produces(MediaType.APPLICATION_JSON)
public class SessionResource {

    @Inject SessionService sessionService;
    @Inject UserRepository users;

    @GET
    public Response me(@CookieParam("SMARTCARE_SESSION") String sessionId) {
        var sOpt = sessionService.load(sessionId);
        if (sOpt.isEmpty()) {
            String json = Json.createObjectBuilder().add("error", "unauthorized").add("message", "Not authenticated").build().toString();
            return Response.status(Response.Status.UNAUTHORIZED).entity(json).type(MediaType.APPLICATION_JSON).build();
        }
        Session s = sOpt.get();
        var json = Json.createObjectBuilder()
                .add("userId", s.userId())
                .add("role", s.role())
                .add("csrfToken", s.csrfToken())
                .add("expiresAt", s.expiresAt().toString());
        users.findByUserId(s.userId()).map(user -> user.getString("displayName"))
                .filter(name -> !name.isBlank()).ifPresent(name -> json.add("displayName", name));
        return Response.ok(json.build().toString()).header("Cache-Control", "no-store").build();
    }
}
