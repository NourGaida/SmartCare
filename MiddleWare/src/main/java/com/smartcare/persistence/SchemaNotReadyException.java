package com.smartcare.persistence;

public class SchemaNotReadyException extends RuntimeException {

    public SchemaNotReadyException() {
        super("Database schema is not ready; measurement not stored.");
    }
}
