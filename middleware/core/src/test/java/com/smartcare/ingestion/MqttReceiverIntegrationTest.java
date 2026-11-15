package com.smartcare.ingestion;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoDatabase;
import com.smartcare.persistence.IngestionMongoSupport;
import com.smartcare.persistence.Measurement;
import com.smartcare.persistence.MeasurementRepository;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.BooleanSupplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

class MqttReceiverIntegrationTest {

    private static final String BROKER_URL = "tcp://127.0.0.1:1883";

    @Test
    void storesDeduplicatesAndResubscribesAfterBrokerTakeover() throws Exception {
        Assumptions.assumeTrue(brokerReachable(), "Mosquitto is not reachable on 127.0.0.1:1883");

        MongoClient mongoClient = IngestionMongoSupport.newClient();
        MqttClient publisher = null;
        MqttClient takeover = null;
        MqttReceiver receiver = null;
        try {
            Assumptions.assumeTrue(IngestionMongoSupport.reachable(mongoClient),
                    "MongoDB is not reachable on localhost:27017");

            MongoDatabase database = mongoClient.getDatabase(IngestionMongoSupport.DATABASE);
            database.drop();
            MeasurementRepository repository = IngestionMongoSupport.newRepository(database);

            String deviceId = "it-" + UUID.randomUUID();
            String bootId = UUID.randomUUID().toString();
            String topic = "smartcare/v1/validated/" + deviceId;
            IngestionConfig config = new IngestionConfig(
                    true,
                    BROKER_URL,
                    "smartcare/v1/validated/#",
                    "receiver-" + UUID.randomUUID(),
                    null,
                    null,
                    1,
                    false,
                    Set.of("synced"));
            IngestionCounters counters = new IngestionCounters();
            MeasurementMessageHandler handler = new MeasurementMessageHandler(repository, config);
            receiver = new MqttReceiver(config, handler, counters, 200L);

            publisher = new MqttClient(
                    BROKER_URL,
                    "publisher-" + UUID.randomUUID(),
                    new MemoryPersistence());
            publisher.connect(connectOptions());
            receiver.start();
            waitUntil(() -> counters.snapshot().connected(), 10_000L);

            byte[] first = payload(deviceId, bootId, 1L).getBytes(StandardCharsets.UTF_8);
            publisher.publish(topic, first, 1, false);
            waitUntil(() -> counters.snapshot().saved() == 1, 10_000L);
            assertEquals(1, repository.countByDevice(deviceId));

            publisher.publish(topic, first, 1, false);
            waitUntil(() -> counters.snapshot().duplicate() == 1, 10_000L);
            assertEquals(1, repository.countByDevice(deviceId));

            takeover = new MqttClient(
                    BROKER_URL,
                    config.clientId(),
                    new MemoryPersistence());
            takeover.connect(connectOptions());
            waitUntil(() -> !counters.snapshot().connected(), 10_000L);
            takeover.disconnect();
            takeover.close();
            takeover = null;

            waitUntil(() -> counters.snapshot().connected(), 10_000L);
            publisher.publish(topic,
                    payload(deviceId, bootId, 2L).getBytes(StandardCharsets.UTF_8),
                    1,
                    false);
            waitUntil(() -> counters.snapshot().saved() == 2, 10_000L);
            assertEquals(2, repository.countByDevice(deviceId));

            Optional<Measurement> stored = repository.findByKey(deviceId, bootId, 1L);
            assertTrue(stored.isPresent());
            assertEquals(75, stored.get().heartRate());
            assertEquals(98, stored.get().spo2());
        } finally {
            if (receiver != null) {
                receiver.stop();
            }
            closeQuietly(takeover);
            closeQuietly(publisher);
            mongoClient.getDatabase(IngestionMongoSupport.DATABASE).drop();
            mongoClient.close();
        }
    }

    private static MqttConnectOptions connectOptions() {
        MqttConnectOptions options = new MqttConnectOptions();
        options.setCleanSession(true);
        options.setConnectionTimeout(10);
        return options;
    }

    private static void closeQuietly(MqttClient client) {
        if (client == null) {
            return;
        }
        try {
            if (client.isConnected()) {
                client.disconnect();
            }
        } catch (MqttException ignored) {
        }
        try {
            client.close();
        } catch (MqttException ignored) {
        }
    }

    private static boolean brokerReachable() {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", 1883), 500);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static void waitUntil(BooleanSupplier condition, long timeoutMs) throws InterruptedException {
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        while (!condition.getAsBoolean()) {
            if (System.nanoTime() >= deadline) {
                fail("condition was not met within " + timeoutMs + " ms");
            }
            Thread.sleep(50L);
        }
    }

    private static String payload(String deviceId, String bootId, long sequence) {
        return """
                {"schemaVersion":1,"deviceId":"%s","bootId":"%s","sequence":%d,
                "acquiredAtUtc":"2026-11-14T10:00:%02dZ","heartRate":75,"spo2":98,
                "quality":"good","reason":null,"clockStatus":"synced","source":"integration"}
                """.formatted(deviceId, bootId, sequence, sequence);
    }
}
