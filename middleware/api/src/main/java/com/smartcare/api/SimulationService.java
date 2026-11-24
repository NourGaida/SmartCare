package com.smartcare.api;

import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import com.smartcare.persistence.SimulationRunRepository;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.logging.Logger;

@ApplicationScoped
public class SimulationService {
    private static final Logger LOG = Logger.getLogger(SimulationService.class.getName());
    private static final Map<String, Integer> READING_COUNTS = Map.of("normal", 15, "spike", 26, "sustained", 37, "invalid", 18);
    private static final Duration PROCESS_TIMEOUT = Duration.ofSeconds(75);
    private static final Duration WAIT_FOR_INGESTION = Duration.ofSeconds(10);
    private final Map<String, Process> active = new HashMap<>();
    private final MeasurementRepository measurements;
    private final SimulationRunRepository runs;

    protected SimulationService() { this(null, null); }

    @Inject
    public SimulationService(MeasurementRepository measurements, SimulationRunRepository runs) {
        this.measurements = measurements;
        this.runs = runs;
    }

    public static boolean accepts(String scenario) {
        return scenario != null && READING_COUNTS.containsKey(scenario);
    }

    public synchronized String start(String patientId, String deviceId, String scenario) throws IOException {
        if (!accepts(scenario) || !deviceId.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,79}")) {
            throw new IllegalArgumentException("Unsupported device or scenario");
        }
        if (active.size() >= 4 || active.containsKey(deviceId)
                || runs.latest(patientId, deviceId).map(this::snapshot).filter(run -> "running".equals(run.status())).isPresent()) {
            throw new BusyException();
        }
        Path python = executable("SMARTCARE_SIMULATOR_PYTHON");
        Path script = executable("SMARTCARE_SIMULATOR_SCRIPT");
        String port = System.getenv().getOrDefault("SMARTCARE_SIMULATOR_PORT", "1883");
        String id = UUID.randomUUID().toString();
        runs.start(id, patientId, deviceId, scenario, READING_COUNTS.get(scenario), Instant.now());
        Process process;
        try {
            process = new ProcessBuilder(python.toString(), script.toString(), "--scenario", scenario,
                    "--device-id", deviceId, "--boot-id", id, "--host", "127.0.0.1", "--port", port)
                    .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
        } catch (IOException error) {
            runs.finish(id, -1, Instant.now());
            throw error;
        }
        active.put(deviceId, process);
        process.onExit().orTimeout(PROCESS_TIMEOUT.toSeconds(), TimeUnit.SECONDS)
                .whenComplete((exited, error) -> finish(id, deviceId, process, error));
        return id;
    }

    private synchronized void finish(String id, String deviceId, Process process, Throwable error) {
        try {
            if (error != null) process.destroyForcibly();
            runs.finish(id, error == null ? process.exitValue() : -1, Instant.now());
        } catch (RuntimeException failure) {
            LOG.warning("Could not record the simulation exit in MongoDB.");
        } finally {
            active.remove(deviceId, process);
        }
    }

    public Snapshot read(String patientId, String id) {
        return runs.find(patientId, id).map(this::snapshot).orElse(null);
    }

    public Snapshot latest(String patientId, String deviceId) {
        return runs.latest(patientId, deviceId).map(this::snapshot).orElse(null);
    }

    private Snapshot snapshot(SimulationRunRepository.Run run) {
        List<Measurement> rows = measurements.findForRun(run.patientId(), run.deviceId(), run.id());
        String status = "running";
        String error = null;
        Instant now = Instant.now();
        if (run.finishedAt() != null) {
            if (run.exitCode() != 0) {
                status = "failed";
                error = "The simulator could not finish. Check the local Python and MQTT services.";
            } else if (rows.size() >= run.expected()) {
                status = "completed";
            } else if (run.finishedAt().plus(WAIT_FOR_INGESTION).isBefore(now)) {
                status = "failed";
                error = "Some readings did not reach MongoDB. Check Node-RED and MQTT ingestion.";
            }
        } else if (run.startedAt().plus(PROCESS_TIMEOUT).plus(WAIT_FOR_INGESTION).isBefore(now)) {
            status = "failed";
            error = "The simulator ended without a recorded result.";
        }
        return new Snapshot(run.id(), run.deviceId(), run.scenario(), status, run.expected(), run.startedAt(), rows, error);
    }

    private static Path executable(String variable) throws IOException {
        String configured = System.getenv(variable);
        if (configured == null || configured.isBlank()) throw new IOException("Simulation process is disabled");
        Path path = Path.of(configured);
        if (!path.isAbsolute() || !Files.isRegularFile(path)) throw new IOException("Simulation process is unavailable");
        return path;
    }

    @PreDestroy
    public synchronized void stop() {
        for (Process process : active.values()) {
            if (process.isAlive()) process.destroyForcibly();
        }
        active.clear();
    }

    public static final class BusyException extends RuntimeException {}

    public record Snapshot(String id, String deviceId, String scenario, String status, int expected,
                           Instant startedAt, List<Measurement> measurements, String error) {}
}
