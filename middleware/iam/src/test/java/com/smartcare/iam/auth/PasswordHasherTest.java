package com.smartcare.iam.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordHasherTest {

    @Test
    void hashAndVerifyRoundTrip() {
        PasswordHasher hasher = new Pbkdf2PasswordHasher();
        String hash = hasher.hash("correct horse battery staple");
        assertNotNull(hash);
        assertTrue(hash.startsWith("pbkdf2$"));
        assertTrue(hasher.verify("correct horse battery staple", hash));
        assertFalse(hasher.verify("wrong password", hash));
    }

    @Test
    void samePasswordProducesDifferentHashes() {
        PasswordHasher hasher = new Pbkdf2PasswordHasher();
        String a = hasher.hash("secret");
        String b = hasher.hash("secret");
        assertNotEquals(a, b);
        assertTrue(hasher.verify("secret", a));
        assertTrue(hasher.verify("secret", b));
    }
}
