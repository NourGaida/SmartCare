package com.smartcare.api;

import com.smartcare.ingestion.IngestionCounters;
import com.smartcare.persistence.MongoProvider;
import com.smartcare.persistence.SchemaInitializer;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObjectBuilder;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.bson.Document;

@Path("/health/ingestion")
public class IngestionHealthSource {

    private final MongoProvider mongoProvider;
    private final SchemaInitializer schemaInitializer;
    private final IngestionCounters counters;

    protected IngestionHealthSource() {
        this.mongoProvider = null;
        this.schemaInitializer = null;
        this.counters = null;
    }

    @Inject
    public IngestionHealthSource(
            MongoProvider mongoProvider,
            SchemaInitializer schemaInitializer,
            IngestionCounters counters) {
        this.mongoProvider = mongoProvider;
        this.schemaInitializer = schemaInitializer;
        this.counters = counters;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response health() {
        IngestionHealth health = check();
        return Response.status(health.status())
                .type(MediaType.APPLICATION_JSON)
                .entity(health.body())
                .build();
    }

    IngestionHealth check() {
        boolean databaseReady = ping() && schemaReady();
        IngestionCounters.Snapshot snapshot = counters.snapshot();
        if (databaseReady) {
            return new IngestionHealth(
                    Response.Status.OK.getStatusCode(),
                    body("ok", snapshot));
        }
        return new IngestionHealth(
                Response.Status.SERVICE_UNAVAILABLE.getStatusCode(),
                body("error", snapshot));
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

    private static String body(String status, IngestionCounters.Snapshot snapshot) {
        JsonObjectBuilder reasons = Json.createObjectBuilder();
        snapshot.rejectedByReason().forEach(reasons::add);
        JsonObjectBuilder body = Json.createObjectBuilder()
                .add("status", status)
                .add("connected", snapshot.connected())
                .add("received", snapshot.received())
                .add("saved", snapshot.saved())
                .add("duplicate", snapshot.duplicate())
                .add("rejected", snapshot.rejected())
                .add("storeFailed", snapshot.storeFailed())
                .add("unowned", snapshot.unowned())
                .add("ownershipConflict", snapshot.ownershipConflict())
                .add("rejectedByReason", reasons.build());
        if (snapshot.lastRejectionReason() == null) {
            body.addNull("lastRejectionReason");
        } else {
            body.add("lastRejectionReason", snapshot.lastRejectionReason());
        }
        if (snapshot.lastMessageAt() == null) {
            body.addNull("lastMessageAt");
        } else {
            body.add("lastMessageAt", snapshot.lastMessageAt().toString());
        }
        return body.build().toString();
    }

    record IngestionHealth(int status, String body) {
    }
}
