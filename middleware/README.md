# SmartCare middleware

Jakarta EE 11 backend built as a Maven reactor. The parent POM is [`pom.xml`](pom.xml); the deployable artifact is produced by the `api` module.

## Modules

| Module | Purpose |
| --- | --- |
| [`core/`](core/README.md) | MongoDB persistence, MQTT ingestion, repository and CDI beans |
| [`iam/`](iam/README.md) | Identity and access module scaffolding for planned authentication and authorization |
| [`api/`](api/README.md) | JAX-RS application, health endpoints and WAR packaging |

Dependency direction: `api -> iam -> core`. `core` does not depend on `api`.

## Build

```powershell
mvn -f middleware/pom.xml clean verify
```

The persistence tests in `core` need MongoDB on `localhost:27017`; the MQTT integration test also needs Mosquitto on `localhost:1883`. CI starts both services. The build produces:

```text
middleware/api/target/smartcare.war
```

The WAR keeps the `smartcare` final name and the `/smartcare` context path used by the frontends and scripts.

For a faster package build without tests:

```powershell
mvn -f middleware/pom.xml clean package -DskipTests
```

## Deploy

Deploy only through `jboss-cli`; do not copy the WAR into `standalone\deployments`:

```powershell
$wildfly = 'C:\path\to\wildfly'
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\middleware\api\target\smartcare.war --force"
```

## Endpoints

The current API exposes:

- `GET /smartcare/api/health`
- `GET /smartcare/api/health/database`
- `GET /smartcare/api/health/ingestion`

See [`api/README.md`](api/README.md) for details.

## MQTT ingestion

`MqttReceiver` subscribes to the validated topic, validates and maps each payload, then stores it through `MeasurementRepository`. The receiver uses an asynchronous Paho client, reconnects with backoff and resubscribes after a connection loss. A broker outage does not prevent the WAR from deploying.

Configuration is read from environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `MQTT_ENABLED` | Start the receiver | `true` |
| `MQTT_BROKER_URL` | Broker URI | `tcp://localhost:1883` |
| `MQTT_TOPIC` | Subscription filter | `smartcare/v1/validated/#` |
| `MQTT_CLIENT_ID` | Stable Paho client id | `smartcare-middleware` |
| `MQTT_USERNAME` | Optional broker username | unset |
| `MQTT_PASSWORD` | Optional broker password | unset |
| `MQTT_QOS` | Subscription QoS (`0`, `1`, `2`) | `1` |
| `MQTT_CLEAN_SESSION` | Paho clean-session flag | `false` |
| `MQTT_ACCEPTED_CLOCK_STATUS` | Comma-separated accepted clock states | `synced` |

`received = saved + duplicate + rejected`; `storeFailed` is a subset of `rejected`. Rejections are counted by reason and reported by `/health/ingestion`.

## CDI and tests

Each module has its own `META-INF/beans.xml` where needed. There is no `web.xml`; the API module uses the Jakarta EE annotations and its `WEB-INF/beans.xml` descriptor.

Java tests live in the module that owns the code:

- `middleware/core/src/test/java/com/smartcare/persistence/`
- `middleware/core/src/test/java/com/smartcare/ingestion/`
- `middleware/api/src/test/java/com/smartcare/api/`

CI reads Surefire reports from `middleware/*/target/surefire-reports/*.xml`.
