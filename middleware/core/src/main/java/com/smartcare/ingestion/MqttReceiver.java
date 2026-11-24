package com.smartcare.ingestion;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttAsyncClient;
import org.eclipse.paho.client.mqttv3.MqttCallback;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;

@ApplicationScoped
public class MqttReceiver {

    static final long DEFAULT_RECONNECT_DELAY_MS = 5_000L;
    private static final long CONNECT_TIMEOUT_MS = 10_000L;
    private static final Logger LOG = Logger.getLogger(MqttReceiver.class.getName());

    private final IngestionConfig config;
    private final MeasurementMessageHandler handler;
    private final IngestionCounters counters;
    private final DetectionEventHandler detectorEvents;
    private final long reconnectDelayMs;
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean reconnectScheduled = new AtomicBoolean();

    private volatile MqttAsyncClient client;
    private ScheduledExecutorService scheduler;

    protected MqttReceiver() {
        this.config = null;
        this.handler = null;
        this.counters = null;
        this.detectorEvents = null;
        this.reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS;
    }

    @Inject
    public MqttReceiver(
            IngestionConfig config,
            MeasurementMessageHandler handler,
            IngestionCounters counters,
            DetectionEventHandler detectorEvents) {
        this(config, handler, counters, detectorEvents, DEFAULT_RECONNECT_DELAY_MS);
    }

    MqttReceiver(
            IngestionConfig config,
            MeasurementMessageHandler handler,
            IngestionCounters counters,
            long reconnectDelayMs) {
        this(config, handler, counters, null, reconnectDelayMs);
    }

    private MqttReceiver(IngestionConfig config, MeasurementMessageHandler handler, IngestionCounters counters,
                         DetectionEventHandler detectorEvents, long reconnectDelayMs) {
        this.config = config;
        this.handler = handler;
        this.counters = counters;
        this.detectorEvents = detectorEvents;
        this.reconnectDelayMs = reconnectDelayMs;
    }

    public void onStart(@Observes @Initialized(ApplicationScoped.class) Object event) {
        start();
    }

    public void start() {
        if (!config.isEnabled()) {
            LOG.info("MQTT ingestion is disabled (MQTT_ENABLED=false)");
            return;
        }
        if (!running.compareAndSet(false, true)) {
            return;
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "mqtt-receiver");
            thread.setDaemon(true);
            return thread;
        });
        scheduler.schedule(this::connect, 0L, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    public void stop() {
        if (!running.compareAndSet(true, false)) {
            return;
        }
        counters.setConnected(false);
        MqttAsyncClient current = client;
        if (current != null) {
            try {
                if (current.isConnected()) {
                    current.disconnect().waitForCompletion(2_000L);
                }
            } catch (MqttException e) {
                LOG.fine("MQTT disconnect during shutdown failed: " + e.getMessage());
            }
            try {
                current.close();
            } catch (MqttException e) {
                LOG.fine("MQTT client close during shutdown failed: " + e.getMessage());
            }
        }
        ScheduledExecutorService currentScheduler = scheduler;
        if (currentScheduler != null) {
            currentScheduler.shutdownNow();
        }
    }

    private void connect() {
        if (!running.get()) {
            return;
        }
        try {
            MqttAsyncClient current = client;
            if (current == null) {
                current = new MqttAsyncClient(
                        config.brokerUrl(),
                        config.clientId(),
                        new MemoryPersistence());
                current.setCallback(new ReceiverCallback());
                client = current;
            }

            MqttConnectOptions options = new MqttConnectOptions();
            options.setCleanSession(config.cleanSession());
            options.setAutomaticReconnect(false);
            options.setConnectionTimeout(10);
            options.setKeepAliveInterval(30);
            if (config.username() != null) {
                options.setUserName(config.username());
            }
            if (config.password() != null) {
                options.setPassword(config.password().toCharArray());
            }

            LOG.info("Connecting MQTT receiver to " + config.brokerUrl()
                    + " as " + config.clientId());
            if (!current.isConnected()) {
                current.connect(options).waitForCompletion(CONNECT_TIMEOUT_MS);
            }
            current.subscribe(config.topic(), config.qos()).waitForCompletion(CONNECT_TIMEOUT_MS);
            if (detectorEvents != null) {
                current.subscribe(DetectionEventHandler.EVENTS_TOPIC, 1).waitForCompletion(CONNECT_TIMEOUT_MS);
            }
            counters.setConnected(true);
            LOG.info("Subscribed to " + config.topic() + " with QoS " + config.qos());
        } catch (MqttException | RuntimeException e) {
            LOG.warning("MQTT connection failed: " + e.getClass().getSimpleName()
                    + "; retrying in " + reconnectDelayMs + " ms");
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (!running.get() || !reconnectScheduled.compareAndSet(false, true)) {
            return;
        }
        ScheduledExecutorService currentScheduler = scheduler;
        if (currentScheduler == null) {
            reconnectScheduled.set(false);
            return;
        }
        currentScheduler.schedule(() -> {
            reconnectScheduled.set(false);
            connect();
        }, reconnectDelayMs, TimeUnit.MILLISECONDS);
    }

    private final class ReceiverCallback implements MqttCallback {

        @Override
        public void connectionLost(Throwable cause) {
            counters.setConnected(false);
            if (!running.get()) {
                return;
            }
            LOG.warning("MQTT connection lost: "
                    + (cause == null ? "unknown" : cause.getClass().getSimpleName()));
            scheduleReconnect();
        }

        @Override
        public void messageArrived(String topic, MqttMessage message) {
            if (detectorEvents != null && DetectionEventHandler.EVENTS_TOPIC.equals(topic)) {
                try {
                    detectorEvents.handle(message.getPayload());
                } catch (RuntimeException e) {
                    LOG.warning("Detection event persistence failed: " + e.getClass().getSimpleName());
                }
                return;
            }
            counters.messageReceived();
            try {
                IngestionResult result = handler.handle(topic, message.getPayload());
                switch (result.status()) {
                    case SAVED -> {
                        counters.saved();
                        notifyDetector(result, message);
                    }
                    case DUPLICATE -> counters.duplicate();
                    case REJECTED -> {
                        if ("store_failed".equals(result.reason())) {
                            counters.storeFailed(result.reason());
                        } else {
                            counters.rejected(result.reason());
                        }
                    }
                }
            } catch (RuntimeException e) {
                LOG.log(Level.WARNING, "Unexpected ingestion failure: " + e.getClass().getSimpleName());
                counters.storeFailed("handler_failure");
            }
        }

        @Override
        public void deliveryComplete(IMqttDeliveryToken token) {
        }
    }

    private void notifyDetector(IngestionResult result, MqttMessage message) {
        if (detectorEvents == null) return;
        try {
            // The detector only receives measurements after a successful MongoDB write.
            client.publish(DetectionEventHandler.PERSISTED_PREFIX + result.deviceId(), message.getPayload(), 1, false);
        } catch (MqttException e) {
            LOG.warning("Could not notify the detector about a persisted measurement: " + e.getReasonCode());
        }
    }
}
