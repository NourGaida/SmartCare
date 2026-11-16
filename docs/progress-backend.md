# Backend progress

## Baseline (feature/device-ownership)
- JDK/Maven: forced to Java 25 (Corretto 25.0.5), Maven 3.10.0 reports Java 25.
- Services: smartcare-mongodb and smartcare-mosquitto running.
- mvn -f middleware/pom.xml clean verify: BUILD SUCCESS. Tests run: 53 (core), 0 (iam), 2 (api), Failures: 0, Errors: 0, Skipped: 0.
