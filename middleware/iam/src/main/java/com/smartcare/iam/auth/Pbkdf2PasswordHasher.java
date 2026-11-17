package com.smartcare.iam.auth;

import jakarta.enterprise.context.ApplicationScoped;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@ApplicationScoped
public class Pbkdf2PasswordHasher implements PasswordHasher {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 210_000;
    private static final int SALT_BYTES = 16;
    private static final int KEY_BITS = 256;
    private final SecureRandom random = new SecureRandom();

    @Override
    public String hash(String password) {
        if (password == null) {
            throw new IllegalArgumentException("password is required");
        }
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] derived = derive(password.toCharArray(), salt, ITERATIONS, KEY_BITS);
        return "pbkdf2$" + ALGORITHM + "$" + ITERATIONS + "$"
                + Base64.getEncoder().encodeToString(salt) + "$"
                + Base64.getEncoder().encodeToString(derived);
    }

    @Override
    public boolean verify(String password, String encodedHash) {
        if (password == null || encodedHash == null) {
            return false;
        }
        String[] parts = encodedHash.split("\\$");
        if (parts.length != 5 || !"pbkdf2".equals(parts[0])) {
            return false;
        }
        int iterations;
        try {
            iterations = Integer.parseInt(parts[2]);
        } catch (NumberFormatException e) {
            return false;
        }
        byte[] salt;
        byte[] expected;
        try {
            salt = Base64.getDecoder().decode(parts[3]);
            expected = Base64.getDecoder().decode(parts[4]);
        } catch (IllegalArgumentException e) {
            return false;
        }
        byte[] actual = derive(password.toCharArray(), salt, iterations, expected.length * 8);
        return MessageDigest.isEqual(expected, actual);
    }

    private static byte[] derive(char[] password, byte[] salt, int iterations, int keyBits) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, keyBits);
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Unable to hash password", e);
        }
    }
}
