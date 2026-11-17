package com.smartcare.iam.security;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;

public final class Csrf {
    private Csrf() {}
    public static boolean matches(String expected, String provided) {
        if (expected == null || provided == null) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}
