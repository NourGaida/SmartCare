package com.smartcare.iam.auth;

public interface PasswordHasher {
    String hash(String password);
    boolean verify(String password, String encodedHash);
}
