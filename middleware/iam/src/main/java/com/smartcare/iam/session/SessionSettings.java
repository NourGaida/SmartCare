package com.smartcare.iam.session;

public record SessionSettings(long idleMinutes, long absoluteHours, boolean secureCookie, String cookieName) {
    private static final String SECURE_PROPERTY = "smartcare.session.secure";
    private static final String SECURE_ENV = "SMARTCARE_SESSION_SECURE";

    public static SessionSettings defaults() {
        return new SessionSettings(30, 8, readSecureCookie(), "SMARTCARE_SESSION");
    }

    private static boolean readSecureCookie() {
        String value = System.getProperty(SECURE_PROPERTY, System.getenv(SECURE_ENV));
        return value != null && Boolean.parseBoolean(value.trim());
    }
}
