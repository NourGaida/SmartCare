package com.smartcare.ingestion;

import com.smartcare.persistence.SaveResult;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MqttReceiverDownTest {

    @Test
    void startDoesNotBlockWhenBrokerIsUnavailable() {
        IngestionConfig config = new IngestionConfig(
                true,
                "tcp://127.0.0.1:1",
                "smartcare/v1/validated/#",
                "receiver-" + UUID.randomUUID(),
                null,
                null,
                1,
                true,
                Set.of("synced"));
        MeasurementMessageHandler handler = new MeasurementMessageHandler(
                measurement -> SaveResult.SAVED,
                config);
        IngestionCounters counters = new IngestionCounters();
        MqttReceiver receiver = new MqttReceiver(config, handler, counters, 100L);

        try {
            long start = System.nanoTime();
            receiver.start();
            long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);

            assertTrue(elapsedMs < 1_000, "start waited " + elapsedMs + " ms");
            Thread.sleep(500L);
            assertFalse(counters.snapshot().connected());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            receiver.stop();
        }
    }
}
