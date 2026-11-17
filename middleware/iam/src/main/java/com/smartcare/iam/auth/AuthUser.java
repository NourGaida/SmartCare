package com.smartcare.iam.auth;

public record AuthUser(String userId, String email, String passwordHash, String role, boolean active) {}
