# Core module

The `core` module contains the MongoDB persistence layer shared by the backend. It has no JAX-RS or web-layer dependency.

## Contents

- `MongoProvider`: MongoDB client and database access.
- `SchemaInitializer`: collection validators and indexes.
- `Measurement`, `MeasurementMapper`, `MeasurementRepository`: logical measurement storage and `(deviceId, bootId, sequence)` deduplication.
- `SaveResult`, `SchemaNotReadyException`: persistence result and readiness errors.
- `com.smartcare.ingestion`: Paho receiver lifecycle, environment configuration, payload validation, counters and the `MeasurementStore` boundary implemented by `MeasurementRepository`.
- `META-INF/beans.xml`: CDI discovery for the module.

## Tests

The integration tests use MongoDB on `localhost:27017`:

```powershell
mvn -f middleware/pom.xml -pl core -am test
```

They cover schema validators, indexes, idempotent saves, duplicate handling and readiness failures. The ingestion unit tests need no broker; `MqttReceiverIntegrationTest` uses MongoDB and Mosquitto on `localhost` and is skipped locally when either is unavailable. CI starts both services. The parent build runs everything as part of:

```powershell
mvn -f middleware/pom.xml clean verify
```

## Dependency rules

`core` must not depend on `api` or on web-layer classes. The database health check lives in `api` because it depends on the JAX-RS health contract; `api` depends on `core`, not the reverse.
