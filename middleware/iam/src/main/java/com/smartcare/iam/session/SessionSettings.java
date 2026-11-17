package com.smartcare.iam.session;

public record SessionSettings(long idleMinutes, long absoluteHours, boolean secureCookie, String cookieName) {
    public static SessionSettings defaults() {
        return new SessionSettings(30, 8, false, "SMARTCARE_SESSION");
    }
}
