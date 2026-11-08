package com.smartcare.persistence;

import com.mongodb.MongoCommandException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.CreateCollectionOptions;
import com.mongodb.client.model.IndexModel;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.ValidationAction;
import com.mongodb.client.model.ValidationLevel;
import com.mongodb.client.model.ValidationOptions;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Initialized;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import org.bson.Document;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import java.util.logging.Logger;

@ApplicationScoped
public class SchemaInitializer {

    private static final Logger LOG = Logger.getLogger(SchemaInitializer.class.getName());
    private static final int NAMESPACE_EXISTS = 48;

    public static final String MEASUREMENTS = "measurements";
    public static final String DEVICES = "devices";
    public static final String DEVICE_OWNERSHIP = "device_ownership";
    public static final String USERS = "users";
    public static final String ASSIGNMENTS = "assignments";

    public static final String DUPLICATE_INDEX_NAME = "uq_device_boot_sequence";
    // The duplicate key is defined here only. Correctness relies on bootId changing
    // at every device reboot and sequence being monotonic within a boot.
    static final Document DUPLICATE_INDEX_KEYS =
            new Document("deviceId", 1).append("bootId", 1).append("sequence", 1);

    private final Supplier<MongoDatabase> databaseSupplier;
    private final AtomicBoolean ready = new AtomicBoolean(false);
    // Required by CDI to create the client proxy of this @ApplicationScoped bean.
    // Never used for real work: the proxy forwards every call to the real instance.
    protected SchemaInitializer() {
        this.databaseSupplier = null;
    }
    @Inject
    public SchemaInitializer(MongoProvider provider) {
        this(provider::database);
    }

    SchemaInitializer(MongoDatabase database) {
        this(() -> database);
    }

    SchemaInitializer(Supplier<MongoDatabase> databaseSupplier) {
        this.databaseSupplier = databaseSupplier;
    }

    public void onStart(@Observes @Initialized(ApplicationScoped.class) Object event) {
        initialize();
    }

    boolean initialize() {
        MongoDatabase database;
        try {
            database = databaseSupplier.get();
        } catch (RuntimeException e) {
            LOG.warning("Schema initialization skipped: " + e.getMessage());
            return false;
        }
        try {
            ensureCollection(database, MEASUREMENTS, measurementsValidator(), measurementsIndexes());
            ensureCollection(database, DEVICES, devicesValidator(), devicesIndexes());
            ensureCollection(database, DEVICE_OWNERSHIP, deviceOwnershipValidator(), deviceOwnershipIndexes());
            ensureCollection(database, USERS, usersValidator(), usersIndexes());
            ensureCollection(database, ASSIGNMENTS, assignmentsValidator(), assignmentsIndexes());
            ready.set(true);
            return true;
        } catch (RuntimeException e) {
            LOG.warning("Schema initialization failed: " + e.getMessage());
            return false;
        }
    }

    public void ensureReady() {
        if (ready.get()) {
            return;
        }
        synchronized (this) {
            if (ready.get()) {
                return;
            }
            if (!initialize()) {
                throw new SchemaNotReadyException();
            }
        }
    }

    public boolean isReady() {
        return ready.get();
    }

    private void ensureCollection(MongoDatabase database, String name, Document schema, List<IndexModel> indexes) {
        Document validator = new Document("$jsonSchema", schema);
        try {
            ValidationOptions validation = new ValidationOptions()
                    .validator(validator)
                    .validationAction(ValidationAction.ERROR)
                    .validationLevel(ValidationLevel.STRICT);
            database.createCollection(name, new CreateCollectionOptions().validationOptions(validation));
            LOG.info("Created collection '" + name + "' with validator");
        } catch (MongoCommandException e) {
            if (e.getErrorCode() != NAMESPACE_EXISTS) {
                throw e;
            }
            database.runCommand(new Document("collMod", name)
                    .append("validator", validator)
                    .append("validationAction", "error")
                    .append("validationLevel", "strict"));
            LOG.info("Collection '" + name + "' already exists, validator updated");
        }

        MongoCollection<Document> collection = database.getCollection(name);
        for (IndexModel index : indexes) {
            String indexName = collection.createIndex(index.getKeys(), index.getOptions());
            LOG.info("Ensured index '" + indexName + "' on collection '" + name + "'");
        }
    }

    private static Document measurementsValidator() {
        Document properties = new Document()
                .append("deviceId", new Document("bsonType", "string"))
                .append("bootId", new Document("bsonType", "string"))
                .append("sequence", new Document("bsonType", List.of("int", "long")).append("minimum", 1))
                .append("acquiredAt", new Document("bsonType", "date"))
                .append("receivedAt", new Document("bsonType", "date"))
                .append("heartRate", new Document("bsonType", List.of("int", "null")))
                .append("spo2", new Document("bsonType", List.of("int", "null")))
                .append("quality", new Document("bsonType", "string"))
                .append("reason", new Document("bsonType", List.of("string", "null")))
                .append("clockStatus", new Document("bsonType", "string"))
                .append("source", new Document("bsonType", List.of("string", "null")))
                .append("patientId", new Document("bsonType", List.of("string", "null")))
                .append("schemaVersion", new Document("bsonType", List.of("int", "null")));

        Document goodQuality = new Document("required", List.of("quality", "heartRate", "spo2"))
                .append("properties", new Document()
                        .append("quality", new Document("enum", List.of("good")))
                        .append("heartRate", new Document("bsonType", "int"))
                        .append("spo2", new Document("bsonType", "int")));
        Document notGoodQuality = new Document("required", List.of("reason"))
                .append("properties", new Document("reason",
                        new Document("bsonType", "string").append("minLength", 1)))
                .append("not", new Document("required", List.of("quality"))
                        .append("properties", new Document("quality",
                                new Document("enum", List.of("good")))));

        return new Document("bsonType", "object")
                .append("required", List.of("deviceId", "bootId", "sequence",
                        "acquiredAt", "receivedAt", "quality", "clockStatus"))
                .append("properties", properties)
                .append("anyOf", List.of(goodQuality, notGoodQuality));
    }

    private static List<IndexModel> measurementsIndexes() {
        return List.of(
                new IndexModel(DUPLICATE_INDEX_KEYS,
                        new IndexOptions().unique(true).name(DUPLICATE_INDEX_NAME)),
                new IndexModel(new Document("patientId", 1).append("acquiredAt", -1),
                        new IndexOptions().name("ix_patient_time")));
    }

    private static Document devicesValidator() {
        return new Document("bsonType", "object")
                .append("required", List.of("deviceId", "status", "enrolledAt"))
                .append("properties", new Document()
                        .append("deviceId", new Document("bsonType", "string"))
                        .append("status", new Document("bsonType", "string")
                                .append("enum", List.of("ENROLLED", "REVOKED")))
                        .append("enrolledAt", new Document("bsonType", "date"))
                        .append("revokedAt", new Document("bsonType", List.of("date", "null"))));
    }

    private static List<IndexModel> devicesIndexes() {
        return List.of(new IndexModel(new Document("deviceId", 1),
                new IndexOptions().unique(true).name("uq_device_id")));
    }

    private static Document deviceOwnershipValidator() {
        return new Document("bsonType", "object")
                .append("required", List.of("deviceId", "patientId", "validFrom"))
                .append("properties", new Document()
                        .append("deviceId", new Document("bsonType", "string"))
                        .append("patientId", new Document("bsonType", "string"))
                        .append("validFrom", new Document("bsonType", "date"))
                        .append("validTo", new Document("bsonType", List.of("date", "null"))));
    }

    private static List<IndexModel> deviceOwnershipIndexes() {
        return List.of(new IndexModel(new Document("deviceId", 1).append("validFrom", -1),
                new IndexOptions().name("ix_ownership_device_time")));
    }

    private static Document usersValidator() {
        return new Document("bsonType", "object")
                .append("required", List.of("userId", "email", "passwordHash", "role", "active", "createdAt"))
                .append("properties", new Document()
                        .append("userId", new Document("bsonType", "string"))
                        .append("email", new Document("bsonType", "string"))
                        .append("passwordHash", new Document("bsonType", "string"))
                        .append("role", new Document("bsonType", "string")
                                .append("enum", List.of("PATIENT", "PROFESSIONAL", "ADMIN")))
                        .append("active", new Document("bsonType", "bool"))
                        .append("createdAt", new Document("bsonType", "date")));
    }

    private static List<IndexModel> usersIndexes() {
        return List.of(
                new IndexModel(new Document("userId", 1),
                        new IndexOptions().unique(true).name("uq_user_id")),
                new IndexModel(new Document("email", 1),
                        new IndexOptions().unique(true).name("uq_user_email")));
    }

    private static Document assignmentsValidator() {
        return new Document("bsonType", "object")
                .append("required", List.of("professionalId", "patientId", "createdAt"))
                .append("properties", new Document()
                        .append("professionalId", new Document("bsonType", "string"))
                        .append("patientId", new Document("bsonType", "string"))
                        .append("createdAt", new Document("bsonType", "date")));
    }

    private static List<IndexModel> assignmentsIndexes() {
        return List.of(
                new IndexModel(new Document("professionalId", 1).append("patientId", 1),
                        new IndexOptions().unique(true).name("uq_professional_patient")),
                new IndexModel(new Document("patientId", 1),
                        new IndexOptions().name("ix_assignment_patient")));
    }
}
