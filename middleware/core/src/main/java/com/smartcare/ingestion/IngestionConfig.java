package com.smartcare.ingestion;

import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.logging.Logger;

@ApplicationScoped
public class IngestionConfig {

    public static final String DEFAULT_BROKER_URL = "tcp://localhost:1883";
    public static final String DEFAULT_TOPIC = "smartcare/v1/validated/#";
    public static final String DEFAULT_CLIENT_ID = "smartcare-middleware";
    public static final int DEFAULT_QOS = 1;
    public static final Set<String> DEFAULT_ACCEPTED_CLOCK_STATUSES = Set.of("synced");

    private static final Logger LOG = Logger.getLogger(IngestionConfig.class.getName());

    private final boolean enabled;
    private final String brokerUrl;
    private final String topic;
    private final String topicPrefix;
    private final String clientId;
    private final String username;
    private final String password;
    private final int qos;
    private final boolean cleanSession;
    private final Set<String> acceptedClockStatuses;

    public IngestionConfig() {
        this(
                parseEnabled(System.getenv("MQTT_ENABLED")),
                envOrDefault("MQTT_BROKER_URL", DEFAULT_BROKER_URL),
                envOrDefault("MQTT_TOPIC", DEFAULT_TOPIC),
                envOrDefault("MQTT_CLIENT_ID", DEFAULT_CLIENT_ID),
                optionalEnv("MQTT_USERNAME"),
                optionalEnv("MQTT_PASSWORD"),
                parseQos(System.getenv("MQTT_QOS")),
                parseCleanSession(System.getenv("MQTT_CLEAN_SESSION")),
                parseAcceptedClockStatuses(System.getenv("MQTT_ACCEPTED_CLOCK_STATUS")));
    }

    IngestionConfig(
            boolean enabled,
            String brokerUrl,
            String topic,
            String clientId,
            String username,
            String password,
            int qos,
            boolean cleanSession,
            Set<String> acceptedClockStatuses) {
        this.enabled = enabled;
        this.brokerUrl = requireNonBlank(brokerUrl, DEFAULT_BROKER_URL);
        this.topic = requireNonBlank(topic, DEFAULT_TOPIC);
        this.topicPrefix = deriveTopicPrefix(this.topic);
        this.clientId = requireNonBlank(clientId, DEFAULT_CLIENT_ID);
        this.username = blankToNull(username);
        this.password = blankToNull(password);
        this.qos = qos >= 0 && qos <= 2 ? qos : DEFAULT_QOS;
        this.cleanSession = cleanSession;
        if (acceptedClockStatuses == null || acceptedClockStatuses.isEmpty()) {
            this.acceptedClockStatuses = DEFAULT_ACCEPTED_CLOCK_STATUSES;
        } else {
            this.acceptedClockStatuses = Collections.unmodifiableSet(
                    new LinkedHashSet<>(acceptedClockStatuses));
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String brokerUrl() {
        return brokerUrl;
    }

    public String topic() {
        return topic;
    }

    public String topicPrefix() {
        return topicPrefix;
    }

    public String clientId() {
        return clientId;
    }

    public String username() {
        return username;
    }

    public String password() {
        return password;
    }

    public int qos() {
        return qos;
    }

    public boolean cleanSession() {
        return cleanSession;
    }

    public Set<String> acceptedClockStatuses() {
        return acceptedClockStatuses;
    }

    static String deriveTopicPrefix(String topic) {
        String value = topic == null ? "" : topic.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.endsWith("/#")) {
            value = value.substring(0, value.length() - 2);
        } else if (value.endsWith("#")) {
            value = value.substring(0, value.length() - 1);
        } else if (value.endsWith("/+")) {
            value = value.substring(0, value.length() - 2);
        } else if (value.endsWith("+")) {
            value = value.substring(0, value.length() - 1);
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value.isBlank() ? deriveTopicPrefix(DEFAULT_TOPIC) : value;
    }

    static boolean parseEnabled(String raw) {
        if (raw == null || raw.isBlank()) {
            return true;
        }
        if (raw.trim().equalsIgnoreCase("true")) {
            return true;
        }
        if (raw.trim().equalsIgnoreCase("false")) {
            return false;
        }
        LOG.warning("MQTT_ENABLED must be true or false; using true");
        return true;
    }

    static int parseQos(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_QOS;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            if (value >= 0 && value <= 2) {
                return value;
            }
            LOG.warning("MQTT_QOS must be 0, 1 or 2; using " + DEFAULT_QOS);
        } catch (NumberFormatException e) {
            LOG.warning("MQTT_QOS is not a number; using " + DEFAULT_QOS);
        }
        return DEFAULT_QOS;
    }

    static boolean parseCleanSession(String raw) {
        if (raw == null || raw.isBlank()) {
            return false;
        }
        if (raw.trim().equalsIgnoreCase("true")) {
            return true;
        }
        if (raw.trim().equalsIgnoreCase("false")) {
            return false;
        }
        LOG.warning("MQTT_CLEAN_SESSION must be true or false; using false");
        return false;
    }

    static Set<String> parseAcceptedClockStatuses(String raw) {
        if (raw == null || raw.isBlank()) {
            return DEFAULT_ACCEPTED_CLOCK_STATUSES;
        }
        Set<String> values = new LinkedHashSet<>();
        for (String part : raw.split(",")) {
            String value = part.trim();
            if (!value.isEmpty()) {
                values.add(value);
            }
        }
        if (values.isEmpty()) {
            return DEFAULT_ACCEPTED_CLOCK_STATUSES;
        }
        return Collections.unmodifiableSet(values);
    }

    private static String envOrDefault(String name, String defaultValue) {
        return requireNonBlank(System.getenv(name), defaultValue);
    }

    private static String optionalEnv(String name) {
        return blankToNull(System.getenv(name));
    }

    private static String requireNonBlank(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
