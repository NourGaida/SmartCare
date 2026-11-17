# API module

The `api` module contains the JAX-RS application and the deployable WAR.

## Contents

- `SmartCareApplication`: JAX-RS application path.
- `HealthSource` / `DatabaseHealthSource`: `/health` and `/health/database` endpoints.
- `IngestionHealthSource`: `/health/ingestion` endpoint with broker connection state and ingestion counters.
- `PatientMeasurementsResource`: `GET /me/measurements`, limited to the patient in the authenticated session.
- `WEB-INF/beans.xml`: CDI descriptor for the web module.
- `DatabaseHealthSourceTest` / `IngestionHealthSourceTest`: health endpoint tests.

The application uses annotations for REST resources. `WEB-INF/web.xml` defines MIME types
and directory index handling for the packaged frontend files.

## Patient measurement history

`GET /smartcare/api/me/measurements` uses the existing session cookie and the session
validated by `SecurityFilter`. Only `PATIENT` sessions are accepted. The session's
`userId` must be the same identifier as the stored measurement's `patientId` (set
by device ownership at ingestion). The MongoDB query always filters on this owner;
client-supplied `patientId` or `userId` parameters are ignored. Unowned measurements
are never returned, including when they share the patient's device identifier.
The resource reads the filter's session property through `HttpServletRequest`
attributes. `ContainerRequestContext` injection in a REST resource is not
supported by the deployed WildFly/RESTEasy runtime.

The JSON envelope is `{ "measurements": [...] }`, with `acquiredAtUtc` (ISO UTC),
`heartRate` (bpm), `spo2` (%), `quality`, `reason`, `deviceId` and `source`.
Null measurements and their invalid reason are preserved. Rows are oldest first;
an empty history is HTTP 200 with an empty array. The route returns all owned rows;
server pagination and filters are not yet implemented. The frontend performs its
existing filtering and pagination on this response.

HTTP errors: 401 for a missing/expired/revoked session, 403 for other roles,
503 if the measurement store is unavailable. Resource responses use
`Cache-Control: no-store`; raw MongoDB documents and patient/session IDs are not exposed.

With JDK 25, Maven and MongoDB on localhost:27017, from the repository root:

```powershell
mvn -f middleware/pom.xml -pl api -am "-Dtest=PatientMeasurementsResourceTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -f middleware/pom.xml verify
```

The seven targeted tests use two fictional logins, real MongoDB sessions and a
unique temporary database, deleted afterward. They call the real security filter,
repository and resource through an in-memory JAX-RS context. They verify patient
isolation, forged identifiers, invalid nulls, an empty history, rejected sessions
and roles, and database failure. They do not start or redeploy WildFly. RESTEasy
is a test-only dependency for response builders and is supplied by WildFly at runtime.

The opt-in `frontends/tests/integration/patient-history-http.test.mjs` additionally
tests an actual deployed WAR: fresh login, session, measurement history through
the frontend adapter, forged query identifiers and logout. It compares the served
patient modules with the working tree. See the [patient guide](../../frontends/frontoffice/README.md#vérifier-le-war-déployé-et-une-vraie-connexion)
for credential variables, observed HTTP results and manual browser steps.

## Build and package

```powershell
mvn -f middleware/pom.xml -pl api -am clean package
```

Output:

```text
middleware/api/target/smartcare.war
```

The `finalName` is `smartcare`, and the deployed context path is `/smartcare`. A clean build removes any older `smartcare-api-1.0.0.war` left from before the rename.

The WAR includes the two portals under `/smartcare/frontends/frontoffice/` and
`/smartcare/frontends/backoffice/`. Open them on the same host and port as `/smartcare/api/`
so the browser can use the server's session cookie. See the [frontend guide](../../frontends/README.md).

## Deploy

Use `jboss-cli` rather than copying the WAR:

```powershell
$wildfly = 'C:\path\to\wildfly'
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\middleware\api\target\smartcare.war --force"
```

## Health checks

```powershell
curl.exe -i http://localhost:8080/smartcare/api/health
curl.exe -i http://localhost:8080/smartcare/api/health/database
curl.exe -i http://localhost:8080/smartcare/api/health/ingestion
```

The first two are expected to return HTTP 200 when MongoDB is reachable. `/health/ingestion` returns 200 when MongoDB and the schema are ready and 503 otherwise; its body reports `connected`, `received`, `saved`, `duplicate`, `rejected`, `storeFailed`, `rejectedByReason`, `lastRejectionReason` and `lastMessageAt`.

## Dependency direction

`api` depends on `core` and `iam`. `DatabaseHealthSource` stays in `api` because it implements the web health contract; `core` does not depend on `api`.
