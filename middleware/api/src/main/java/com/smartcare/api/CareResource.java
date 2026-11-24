package com.smartcare.api;

import com.mongodb.MongoException;
import com.smartcare.api.auth.SecurityFilter;
import com.smartcare.iam.session.Session;
import com.smartcare.persistence.AlertRepository;
import com.smartcare.persistence.CareRepository;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import com.smartcare.persistence.SchemaNotReadyException;
import jakarta.inject.Inject;
import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonException;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.bson.Document;

import java.io.IOException;
import java.io.StringReader;
import java.util.Date;
import java.util.List;
import java.util.function.Function;

@Path("/")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class CareResource {
    private final CareRepository care;
    private final MeasurementRepository measurements;
    private final AlertRepository alerts;
    private final SimulationService simulations;

    protected CareResource() { this(null, null, null, null); }

    @Inject
    public CareResource(CareRepository care, MeasurementRepository measurements,
                        AlertRepository alerts, SimulationService simulations) {
        this.care = care;
        this.measurements = measurements;
        this.alerts = alerts;
        this.simulations = simulations;
    }

    @GET
    @Path("patients")
    public Response patients(@Context HttpServletRequest request) {
        return authorized(request, "PROFESSIONAL", session -> {
            var patients = Json.createArrayBuilder();
            care.assignedPatients(session.userId()).forEach(patient -> patients.add(patientSummary(patient)));
            return ok(Json.createObjectBuilder().add("patients", patients));
        });
    }

    @GET
    @Path("patients/{patientId}/measurements")
    public Response patientMeasurements(@Context HttpServletRequest request, @PathParam("patientId") String patientId) {
        return assigned(request, patientId, session ->
                ok(Json.createObjectBuilder().add("measurements", readings(measurements.findByPatientId(patientId)))));
    }

    @GET
    @Path("patients/{patientId}/alerts")
    public Response patientAlerts(@Context HttpServletRequest request, @PathParam("patientId") String patientId) {
        return assigned(request, patientId, session -> alertList(patientId, true));
    }

    @GET
    @Path("me/alerts")
    public Response myAlerts(@Context HttpServletRequest request) {
        return authorized(request, "PATIENT", session -> alertList(session.userId(), false));
    }

    @GET
    @Path("me/latest-simulation")
    public Response myLatestSimulation(@Context HttpServletRequest request) {
        return authorized(request, "PATIENT", session -> latestSimulation(session.userId(), null));
    }

    @GET
    @Path("patients/{patientId}/latest-simulation")
    public Response patientLatestSimulation(@Context HttpServletRequest request, @PathParam("patientId") String patientId,
                                            @QueryParam("deviceId") String deviceId) {
        return assigned(request, patientId, session -> latestSimulation(patientId, deviceId));
    }

    @GET
    @Path("me/devices")
    public Response myDevices(@Context HttpServletRequest request) {
        return authorized(request, "PATIENT", session ->
                ok(Json.createObjectBuilder().add("devices", devices(session.userId(), false))));
    }

    @POST
    @Path("patients/{patientId}/alerts/{alertId}/acknowledgements")
    public Response acknowledge(@Context HttpServletRequest request, @PathParam("patientId") String patientId,
                                @PathParam("alertId") String alertId, String body) {
        return assigned(request, patientId, session -> {
            String note = read(body).getString("note", "").strip();
            if (note.isEmpty() || note.length() > 500) {
                return error(400, "invalid_note", "Enter an acknowledgement note of 1 to 500 characters.");
            }
            return alerts.acknowledge(patientId, alertId, session.userId(), note)
                    .map(row -> json(200, alert(row, true)))
                    .orElseGet(() -> error(404, "not_found", "Alert not found."));
        });
    }

    @POST
    @Path("patients/{patientId}/simulations")
    public Response startSimulation(@Context HttpServletRequest request, @PathParam("patientId") String patientId,
                                    String body) {
        return assigned(request, patientId, session -> {
            JsonObject input = read(body);
            String deviceId = input.getString("deviceId", "");
            String scenario = input.getString("scenario", "");
            if (!SimulationService.accepts(scenario)) {
                return error(400, "invalid_scenario", "Choose normal, spike, sustained or invalid.");
            }
            boolean enabled = care.activeDevices(patientId).stream()
                    .anyMatch(device -> device.simulationEnabled() && device.id().equals(deviceId));
            if (!enabled) return error(403, "forbidden", "Simulation is unavailable for this device.");
            try {
                String id = simulations.start(patientId, deviceId, scenario);
                return json(202, Json.createObjectBuilder().add("id", id).build());
            } catch (SimulationService.BusyException e) {
                return error(409, "simulation_busy", "A scenario is still active. Try again shortly.");
            } catch (IOException | IllegalArgumentException e) {
                return error(503, "simulation_unavailable", "The server simulator is unavailable.");
            }
        });
    }

    @GET
    @Path("patients/{patientId}/simulations/{id}")
    public Response simulation(@Context HttpServletRequest request, @PathParam("patientId") String patientId,
                               @PathParam("id") String id) {
        return assigned(request, patientId, session -> {
            var result = simulations.read(patientId, id);
            if (result == null) return error(404, "not_found", "Simulation not found.");
            return json(200, simulationJson(result));
        });
    }

    private Response latestSimulation(String patientId, String deviceId) {
        var snapshot = simulations.latest(patientId, deviceId);
        var body = Json.createObjectBuilder();
        if (snapshot == null) body.addNull("run");
        else body.add("run", simulationJson(snapshot));
        return ok(body);
    }

    private static JsonObject simulationJson(SimulationService.Snapshot result) {
        var body = Json.createObjectBuilder().add("id", result.id()).add("deviceId", result.deviceId())
                .add("scenario", result.scenario()).add("status", result.status())
                .add("startedAt", result.startedAt().toString())
                .add("expected", result.expected()).add("measurements", readings(result.measurements()));
        if (result.error() != null) body.add("message", result.error());
        return body.build();
    }

    private JsonObject patientSummary(CareRepository.Patient patient) {
        var item = Json.createObjectBuilder().add("id", patient.id()).add("name", patient.name())
                .add("devices", devices(patient.id(), true))
                .add("openAlerts", alerts.countOpen(patient.id()))
                .add("needsAcknowledgement", alerts.countUnacknowledged(patient.id()));
        measurements.findLatestForPatient(patient.id())
                .ifPresentOrElse(reading -> item.add("latest", PatientMeasurementsResource.toJson(reading)),
                        () -> item.addNull("latest"));
        return item.build();
    }

    private JsonArrayBuilder devices(String patientId, boolean staff) {
        var rows = Json.createArrayBuilder();
        for (var device : care.activeDevices(patientId)) {
            var row = Json.createObjectBuilder().add("deviceId", device.id());
            if (staff) row.add("simulationEnabled", device.simulationEnabled());
            rows.add(row);
        }
        return rows;
    }

    private Response alertList(String patientId, boolean staff) {
        var rows = Json.createArrayBuilder();
        alerts.forPatient(patientId).forEach(row -> rows.add(alert(row, staff)));
        return ok(Json.createObjectBuilder().add("alerts", rows));
    }

    private static JsonObject alert(Document alert, boolean staff) {
        var row = Json.createObjectBuilder().add("id", alert.getString("_id"))
                .add("deviceId", alert.getString("deviceId")).add("bootId", alert.getString("bootId"))
                .add("anomalyType", alert.getString("anomalyType")).add("source", alert.getString("source"))
                .add("status", alert.getDate("resolvedAt") == null ? "open" : "resolved")
                .add("confirmedAt", alert.getDate("confirmedAt").toInstant().toString());
        optionalTime(row, "startedAt", alert.getDate("startedAt"));
        optionalTime(row, "resolvedAt", alert.getDate("resolvedAt"));
        optionalTime(row, "acknowledgedAt", alert.getDate("acknowledgedAt"));
        if (staff && alert.getString("note") != null) row.add("note", alert.getString("note"));
        return row.build();
    }

    private static void optionalTime(JsonObjectBuilder row, String key, Date date) {
        if (date == null) row.addNull(key);
        else row.add(key, date.toInstant().toString());
    }

    private static JsonArrayBuilder readings(List<Measurement> measurements) {
        var rows = Json.createArrayBuilder();
        measurements.forEach(row -> rows.add(PatientMeasurementsResource.toJson(row)));
        return rows;
    }

    private Response assigned(HttpServletRequest request, String patientId, Function<Session, Response> operation) {
        return authorized(request, "PROFESSIONAL", session -> {
            if (!care.isAssigned(session.userId(), patientId) || care.findPatient(patientId).isEmpty()) {
                return error(403, "forbidden", "This patient is outside your assigned workspace.");
            }
            return operation.apply(session);
        });
    }

    private static Response authorized(HttpServletRequest request, String role, Function<Session, Response> operation) {
        if (!(request.getAttribute(SecurityFilter.SESSION_ATTR) instanceof Session session)
                || session.userId() == null || session.userId().isBlank()) {
            return error(401, "unauthorized", "Not authenticated.");
        }
        if (!role.equals(session.role())) return error(403, "forbidden", "Access denied.");
        try {
            return operation.apply(session);
        } catch (MongoException | SchemaNotReadyException e) {
            return error(503, "care_unavailable", "The care workspace is unavailable. Please try again.");
        } catch (JsonException | ClassCastException e) {
            return error(400, "invalid_request", "Invalid request.");
        }
    }

    private static JsonObject read(String body) {
        if (body == null || body.length() > 4096) throw new JsonException("Invalid request body");
        try (var reader = Json.createReader(new StringReader(body))) { return reader.readObject(); }
    }

    private static Response ok(JsonObjectBuilder body) { return json(200, body.build()); }

    private static Response error(int status, String code, String message) {
        return json(status, Json.createObjectBuilder().add("error", code).add("message", message).build());
    }

    private static Response json(int status, JsonObject body) {
        return Response.status(status).type(MediaType.APPLICATION_JSON).entity(body.toString())
                .header("Cache-Control", "no-store").build();
    }
}
