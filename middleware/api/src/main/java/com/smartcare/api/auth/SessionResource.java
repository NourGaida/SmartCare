package com.smartcare.api.auth;

import com.smartcare.iam.session.Session;
import com.smartcare.iam.session.SessionService;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

@Path("/session")
@Produces(MediaType.APPLICATION_JSON)
public class SessionResource {

    @Inject SessionService sessionService;

    @GET
    public Response me(@CookieParam("SMARTCARE_SESSION") String sessionId) {
        var sOpt = sessionService.load(sessionId);
        if (sOpt.isEmpty()) {
            String json = Json.createObjectBuilder().add("error", "unauthorized").add("message", "Not authenticated").build().toString();
            return Response.status(Response.Status.UNAUTHORIZED).entity(json).type(MediaType.APPLICATION_JSON).build();
        }
        Session s = sOpt.get();
        String json = Json.createObjectBuilder()
                .add("userId", s.userId())
                .add("role", s.role())
                .add("csrfToken", s.csrfToken())
                .add("expiresAt", s.expiresAt().toString())
                .build().toString();
        return Response.ok(json).build();
    }
}
