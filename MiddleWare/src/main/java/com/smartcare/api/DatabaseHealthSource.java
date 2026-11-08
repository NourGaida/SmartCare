package com.smartcare.api;

import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.bson.Document;

@Path("/health/database")
public class DatabaseHealthSource {

    @Inject
    MongoProvider mongoProvider;

    @Inject
    SchemaInitializer schemaInitializer;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response health() {
        boolean healthy = ping() && schemaReady();
        if (healthy) {
            return Response.ok("{\"status\":\"ok\"}", MediaType.APPLICATION_JSON).build();
        }
        return Response.status(Response.Status.SERVICE_UNAVAILABLE)
                .type(MediaType.APPLICATION_JSON)
                .entity("{\"status\":\"error\"}")
                .build();
    }

    private boolean ping() {
        try {
            mongoProvider.database().runCommand(new Document("ping", 1));
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean schemaReady() {
        try {
            schemaInitializer.ensureReady();
            return schemaInitializer.isReady();
        } catch (RuntimeException e) {
            return false;
        }
    }
}
