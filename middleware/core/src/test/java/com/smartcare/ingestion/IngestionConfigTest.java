package com.smartcare.ingestion;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IngestionConfigTest {

    @Test
    void derivesTopicPrefixFromSingleLevelWildcard() {
        assertEquals("smartcare/v1/validated",
                IngestionConfig.deriveTopicPrefix("smartcare/v1/validated/#"));
        assertEquals("smartcare/v1/validated",
                IngestionConfig.deriveTopicPrefix("smartcare/v1/validated/+"));
        assertEquals("smartcare/v1/validated",
                IngestionConfig.deriveTopicPrefix("smartcare/v1/validated"));
        assertEquals("smartcare/v1/validated",
                IngestionConfig.deriveTopicPrefix("#"));
    }

    @Test
    void normalizesBlankConfigurationValues() {
        IngestionConfig config = new IngestionConfig(
                true,
                " ",
                " ",
                " ",
                " ",
                " ",
                1,
                false,
                Set.of("synced"));

        assertEquals(IngestionConfig.DEFAULT_BROKER_URL, config.brokerUrl());
        assertEquals(IngestionConfig.DEFAULT_TOPIC, config.topic());
        assertEquals("smartcare/v1/validated", config.topicPrefix());
        assertEquals(IngestionConfig.DEFAULT_CLIENT_ID, config.clientId());
        assertEquals(null, config.username());
        assertEquals(null, config.password());
    }

    @Test
    void fallsBackForInvalidQos() {
        assertEquals(0, IngestionConfig.parseQos("0"));
        assertEquals(2, IngestionConfig.parseQos("2"));
        assertEquals(IngestionConfig.DEFAULT_QOS, IngestionConfig.parseQos("3"));
        assertEquals(IngestionConfig.DEFAULT_QOS, IngestionConfig.parseQos("abc"));
        assertEquals(IngestionConfig.DEFAULT_QOS, IngestionConfig.parseQos(null));
    }

    @Test
    void parsesBooleansWithSafeDefaults() {
        assertTrue(IngestionConfig.parseEnabled(null));
        assertFalse(IngestionConfig.parseEnabled("false"));
        assertTrue(IngestionConfig.parseEnabled("not-a-boolean"));

        assertFalse(IngestionConfig.parseCleanSession(null));
        assertTrue(IngestionConfig.parseCleanSession("TRUE"));
        assertFalse(IngestionConfig.parseCleanSession("not-a-boolean"));
    }

    @Test
    void parsesAcceptedClockStatuses() {
        assertEquals(Set.of("synced", "trusted"),
                IngestionConfig.parseAcceptedClockStatuses("synced, trusted , synced"));
        assertEquals(IngestionConfig.DEFAULT_ACCEPTED_CLOCK_STATUSES,
                IngestionConfig.parseAcceptedClockStatuses(" , "));
        assertEquals(IngestionConfig.DEFAULT_ACCEPTED_CLOCK_STATUSES,
                IngestionConfig.parseAcceptedClockStatuses(null));
    }
}
