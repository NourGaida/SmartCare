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

    private final MongoProvider mongoProvider;
    private final SchemaInitializer schemaInitializer;

    protected DatabaseHealthSource() {
        // Required by CDI/JAX-RS when it creates the resource through the no-arg constructor.
        this.mongoProvider = null;
        this.schemaInitializer = null;
    }

    @Inject
    public DatabaseHealthSource(MongoProvider mongoProvider, SchemaInitializer schemaInitializer) {
        this.mongoProvider = mongoProvider;
        this.schemaInitializer = schemaInitializer;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response health() {
        DatabaseHealth health = check();
        return Response.status(health.status())
                .type(MediaType.APPLICATION_JSON)
                .entity(health.body())
                .build();
    }

    // Kept separate from health() so unit tests can assert the HTTP status and body
    // without needing a JAX-RS runtime delegate to build a Response.
    DatabaseHealth check() {
        boolean healthy = ping() && schemaReady();
        if (healthy) {
            return new DatabaseHealth(Response.Status.OK.getStatusCode(), "{\"status\":\"ok\"}");
        }
        return new DatabaseHealth(Response.Status.SERVICE_UNAVAILABLE.getStatusCode(), "{\"status\":\"error\"}");
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

    record DatabaseHealth(int status, String body) {
    }
}
