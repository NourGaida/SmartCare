package com.smartcare.iam.session;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionSettingsTest {
    private static final String PROPERTY = "smartcare.session.secure";

    private String previous;

    @BeforeEach
    void rememberProperty() {
        previous = System.getProperty(PROPERTY);
    }

    @AfterEach
    void restoreProperty() {
        if (previous == null) System.clearProperty(PROPERTY);
        else System.setProperty(PROPERTY, previous);
    }

    @Test
    void secureCookieIsFalseWhenNothingIsConfigured() {
        System.clearProperty(PROPERTY);
        SessionSettings settings = SessionSettings.defaults();
        assertFalse(settings.secureCookie());
        assertEquals("SMARTCARE_SESSION", settings.cookieName());
        assertEquals(30, settings.idleMinutes());
        assertEquals(8, settings.absoluteHours());
    }

    @Test
    void secureCookieCanBeEnabledForHttpsProfile() {
        System.setProperty(PROPERTY, "true");
        assertTrue(SessionSettings.defaults().secureCookie());
    }

    @Test
    void secureCookieCanBeExplicitlyDisabledForLegacyHttp() {
        System.setProperty(PROPERTY, "false");
        assertFalse(SessionSettings.defaults().secureCookie());
    }
}
