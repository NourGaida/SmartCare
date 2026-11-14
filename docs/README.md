# SmartCare documentation

Cross-cutting documentation for the SmartCare repository. Component-specific documentation stays next to the code it describes.

## Architecture

SmartCare is an IoT patient-monitoring prototype. The current data path is:

```
Python simulator / ESP32 (planned)
        │  MQTT smartcare/v1/raw/{deviceId}
        ▼
Mosquitto broker
        │
        ▼
Node-RED validation gateway
        │  validated/{id} or rejected/{id}
        ▼
Jakarta EE backend on WildFly ──► MongoDB
        │
        ▼
Frontend PWAs (demo data today, backend integration planned)
```

The backend is the authority for ownership, persistence, business rules, alerts, access control and API exposure. Node-RED only validates and routes messages. The browser never connects to MQTT directly.

## Repository layout

| Path | Contents |
| --- | --- |
| `frontends/frontoffice/` | Patient PWA |
| `frontends/backoffice/` | Professional and administrator PWA |
| `frontends/shared/` | Shared demo auth, domain rules and UI helpers |
| `frontends/tests/` | Node test suites and integration driver example |
| `frontends/docs/` | API proposal and access-verification scenarios |
| `middleware/core/` | MongoDB persistence layer and CDI beans |
| `middleware/iam/` | Identity and access module scaffolding |
| `middleware/api/` | JAX-RS application, health endpoints and WAR packaging |
| `iot/broker/` | Mosquitto and Node-RED Docker Compose configuration |
| `iot/gateway/` | Node-RED validation flow |
| `iot/simulator/` | Python MQTT simulator |
| `broker/` | Placeholder README; broker files remain under `iot/broker/` |
| `scripts/` | Demo and recovery helpers |
| `docs/` | This index and historical task prompts |

The split into `frontoffice` and `backoffice`, the `core` / `iam` / `api` Maven modules, and the target domain names (`www.smartcare.test`, `frontoffice.smartcare.test`, `backoffice.smartcare.test`, `api.smartcare.test`, `iam.smartcare.test`, `admin.smartcare.test`) are organisational targets. The current academic deployment still serves the WAR at `/smartcare` on WildFly.

## Local development

1. Start MongoDB (for example `smartcare-mongodb` on `localhost:27017`).
2. Start the broker and gateway, if MQTT ingestion is needed: `docker compose -f iot/broker/docker-compose.yml up -d`.
3. Build the backend, then deploy the WAR through `jboss-cli`:
   `mvn -f middleware/pom.xml clean package`
4. Serve the repository root over HTTP and open:
   - `http://127.0.0.1:8080/frontends/frontoffice/`
   - `http://127.0.0.1:8080/frontends/backoffice/`

The PWAs currently use in-memory demo fixtures. REST and WebSocket integration is planned; see [`frontends/docs/api-proposal.md`](../frontends/docs/api-proposal.md).

## Documentation index

- [Repository README](../README.md)
- [Middleware](../middleware/README.md)
- [Core module](../middleware/core/README.md)
- [IAM module](../middleware/iam/README.md)
- [API module](../middleware/api/README.md)
- [Frontends](../frontends/README.md)
- [Frontoffice](../frontends/frontoffice/README.md)
- [Backoffice](../frontends/backoffice/README.md)
- [IoT](../iot/README.md)
- [Broker placeholder](../broker/README.md)
- [Scripts](../scripts/README.md)
- [MQTT message contract](../iot/docs/message-contract.md)
- [API proposal](../frontends/docs/api-proposal.md)
- [Access verification](../frontends/docs/access-verification.md)

Historical task prompts are kept verbatim in [`prompts/`](prompts/). They describe the state of the repository at the time they were executed.
