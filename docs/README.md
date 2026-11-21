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
| `middleware/core/` | MongoDB persistence layer, MQTT ingestion and CDI beans |
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
   Maven uses `JAVA_HOME`. On the lab PC, set `$env:JAVA_HOME='C:\Program Files\Amazon Corretto\jdk25.0.5_0'` before `mvn` if Maven reports Java 17. CI uses `actions/setup-java` with Java 25 and a `mongo:8` service container; integration tests fail when MongoDB is unreachable. See [`middleware/README.md`](../middleware/README.md).
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

## HTTPS/PWA rollout index

Reading order for the `feature/https-pwa` work. Documents marked **planned** are created when their step is executed; anything not yet run is marked `UNVERIFIED` inside the document.

1. [00 — Overview and request flow](https-pwa/00-overview.md)
2. [01 — Phase A audit](https-pwa/01-audit.md)
3. [02 — Hostnames](https-pwa/02-hostnames.md) — **planned (B1)**
4. [03 — Certificates](https-pwa/03-certificates.md) — **planned (B2)**
5. [04 — nginx TLS](https-pwa/04-nginx-tls.md) — **planned (B3)**
6. [05 — WildFly proxy and cookies](https-pwa/05-wildfly-proxy-cookies.md) — **planned (B4)**
7. [06 — Firewall](https-pwa/06-firewall.md) — **planned (B5)**
8. [07 — HTTPS verification](https-pwa/07-https-verification.md) — **planned (B6)**
9. [08 — PWA manifest and icons](https-pwa/08-pwa-manifest-icons.md) — **planned (C1/C2)**
10. [09 — Service worker](https-pwa/09-service-worker.md) — **planned (C3)**
11. [10 — Registration and install UX](https-pwa/10-registration-install-ux.md) — **planned (C4)**
12. [11 — Login in installed mode](https-pwa/11-login-installed-mode.md) — **planned (C5)**
13. [12 — PWA verification](https-pwa/12-pwa-verification.md) — **planned (C6)**
14. [13 — Phone access](https-pwa/13-phone-access.md) — **planned (Phase D)**
15. [14 — Consolidated troubleshooting](https-pwa/14-troubleshooting.md)
16. [Clearing browser state and local DNS routing](https-pwa/clear-browser-state.md)
17. [Screenshots to capture](https-pwa/screenshots-todo.md)
18. [Evidence](https-pwa/evidence/)
19. [CHANGELOG](CHANGELOG.md) · [GLOSSARY](GLOSSARY.md) · [Decision records](decisions/) · [Prompt log](prompts/00-master-prompt.md)

Also available: [short HTTPS/PWA architecture note](../https-pwa.md). Planned later: `docs/pwa-audit/` (Lighthouse reports) and `docs/pwa-test-checklist.md` (manual phone checklist).
