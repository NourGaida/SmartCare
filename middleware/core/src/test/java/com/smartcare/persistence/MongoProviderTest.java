package com.smartcare.persistence;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MongoProviderTest {

    @Test
    void usesTwoSecondsWhenEnvValueIsMissing() {
        assertEquals(2000L, MongoProvider.parseServerSelectionTimeout(null));
        assertEquals(2000L, MongoProvider.parseServerSelectionTimeout("   "));
    }

    @Test
    void acceptsPositiveEnvValue() {
        assertEquals(1500L, MongoProvider.parseServerSelectionTimeout("1500"));
        assertEquals(4500L, MongoProvider.parseServerSelectionTimeout(" 4500 "));
    }

    @Test
    void fallsBackToTwoSecondsForInvalidEnvValue() {
        assertEquals(2000L, MongoProvider.parseServerSelectionTimeout("not-a-number"));
        assertEquals(2000L, MongoProvider.parseServerSelectionTimeout("0"));
        assertEquals(2000L, MongoProvider.parseServerSelectionTimeout("-500"));
    }
}
