package com.smartcare.api;

import com.mongodb.MongoException;
import com.smartcare.api.auth.SecurityFilter;
import com.smartcare.iam.session.Session;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import com.smartcare.persistence.SchemaNotReadyException;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.json.JsonValue;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

@Path("/me/measurements")
@Produces(MediaType.APPLICATION_JSON)
public class PatientMeasurementsResource {

    private final MeasurementRepository measurements;

    protected PatientMeasurementsResource() { this.measurements = null; }

    @Inject
    public PatientMeasurementsResource(MeasurementRepository measurements) {
        this.measurements = measurements;
    }

    @GET
    public Response get(@Context HttpServletRequest request) {
        // Only the authentication filter supplies this property. Client query parameters
        // (patientId, userId, etc.) must never determine the owner of a /me request.
        // JAX-RS request properties are shared with servlet attributes. Injecting
        // ContainerRequestContext in a resource is not supported by WildFly/RESTEasy.
        Object authenticated = request.getAttribute(SecurityFilter.SESSION_ATTR);
        if (!(authenticated instanceof Session session)
                || session.userId() == null || session.userId().isBlank()) {
            return error(401, "unauthorized", "Not authenticated");
        }
        if (!"PATIENT".equals(session.role())) {
            return error(403, "forbidden", "Patient session required");
        }
        try {
            var rows = Json.createArrayBuilder();
            for (Measurement measurement : measurements.findByPatientId(session.userId())) {
                rows.add(toJson(measurement));
            }
            return json(200, Json.createObjectBuilder().add("measurements", rows).build());
        } catch (MongoException | SchemaNotReadyException e) {
            return error(503, "measurements_unavailable", "Measurement history is unavailable");
        }
    }

    private static JsonObject toJson(Measurement measurement) {
        return Json.createObjectBuilder()
                .add("acquiredAtUtc", measurement.acquiredAt().toString())
                .add("heartRate", measurement.heartRate() == null ? JsonValue.NULL
                        : Json.createValue(measurement.heartRate()))
                .add("spo2", measurement.spo2() == null ? JsonValue.NULL
                        : Json.createValue(measurement.spo2()))
                .add("quality", measurement.quality())
                .add("reason", measurement.reason() == null ? JsonValue.NULL
                        : Json.createValue(measurement.reason()))
                .add("deviceId", measurement.deviceId())
                .add("source", measurement.source() == null ? JsonValue.NULL
                        : Json.createValue(measurement.source()))
                .build();
    }

    private static Response error(int status, String code, String message) {
        return json(status, Json.createObjectBuilder().add("error", code).add("message", message).build());
    }

    private static Response json(int status, JsonObject body) {
        return Response.status(status).type(MediaType.APPLICATION_JSON).entity(body.toString())
                .header("Cache-Control", "no-store").build();
    }
}
