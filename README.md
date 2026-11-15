# SmartCare Cloud of Things

SmartCare is an IoT-based patient monitoring and early-warning platform developed as an academic project at SUP'COM (module *Cloud of Things*, 2026/2027, team 9).

The target architecture: an ESP32 with a MAX30102 sensor publishes physiological measurements over MQTT; a Node-RED gateway validates them; a Jakarta EE backend on WildFly stores them in MongoDB, applies business rules and raises alerts; a Python service scores anomalies asynchronously; two Progressive Web Apps give patients and monitoring staff access to the data.

> **Medical disclaimer.** SmartCare is an educational prototype, not a medical product. Physiological values and anomaly scores are experimental estimates and must not be interpreted as medical diagnoses.

> **Project status.** This repository is under active development. Section 2 lists exactly what is implemented on `main` and what is still planned. Sections that describe planned features are marked as such.

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Implementation status](#2-implementation-status)
3. [Repository structure](#3-repository-structure)
4. [Getting started](#4-getting-started)
5. [MQTT topics and message contract](#5-mqtt-topics-and-message-contract)
6. [Backend and data model](#6-backend-and-data-model)
7. [REST API](#7-rest-api)
8. [Frontend (PWAs)](#8-frontend-pwas)
9. [Configuration](#9-configuration)
10. [Security](#10-security)
11. [Testing and CI](#11-testing-and-ci)
12. [Git workflow and academic integrity](#12-git-workflow-and-academic-integrity)
13. [Limitations](#13-limitations)

---

## 1. Architecture

```
 Python simulator (today)  /  ESP32 + MAX30102 (planned)
              │  smartcare/v1/raw/{deviceId}
              ▼
        Mosquitto MQTT broker
              │
              ▼
        Node-RED gateway ── JSON parsing + validation
              │
        ┌─────┴──────┐
        ▼            ▼
  validated/{id}  rejected/{id}
        │
        ▼
 WildFly · Jakarta EE backend ──► MongoDB
        │
        ├──► business rules ──► alerts        (planned)
        └──► Python anomaly service ──► scores (planned)

 PWAs: frontoffice (patient) · backoffice (professional / administrator)
```

Design principles:

- The backend is the single authority for ownership, persistence, business logic, alert decisions, access control and API exposure.
- Node-RED is a gateway only: it validates and routes messages and holds no business logic. Validation is not anomaly detection.
- Anomaly analysis is asynchronous: measurement storage, display and rule processing never wait for the Python service.
- The browser never connects to MQTT directly; it talks to the backend.

---

## 2. Implementation status

| Component | Status | Where |
| --- | --- | --- |
| Python MQTT simulator (7 scenarios + `all`) | Implemented, tested | `iot/simulator/` |
| Mosquitto broker and Node-RED (Docker Compose) | Implemented | `iot/broker/` |
| Node-RED validation gateway | Implemented, verified locally | `iot/gateway/flows/flows.json` |
| MongoDB persistence (schema validators, indexes, deduplication, repository) | Implemented, tested | `middleware/core/src/main/java/com/smartcare/persistence/` |
| Backend ingestion of validated MQTT messages | Implemented, integration-tested | `middleware/core/src/main/java/com/smartcare/ingestion/` |
| Health endpoints (`/health`, `/health/database`, `/health/ingestion`) | Implemented | `middleware/api/src/main/java/com/smartcare/api/` |
| Patient PWA (demo data) | Implemented, demo only | `frontends/frontoffice/` |
| Supervision PWA (professional and administrator, demo data) | Implemented, demo only | `frontends/backoffice/` |
| Continuous integration (Java, frontend, simulator) | Implemented | `.github/workflows/ci.yml` |
| REST resources for users, devices, measurements, alerts, scores, configuration | Planned | see [`frontends/docs/api-proposal.md`](frontends/docs/api-proposal.md) |
| Authentication, role-based authorization, audit log | Planned | frontend uses a non-secure demo login |
| Business rules and alert creation | Planned | |
| Python anomaly service (scores) | Planned | only [`iot/docs/model-card.md`](iot/docs/model-card.md) exists |
| ESP32 + MAX30102 firmware | Planned | the simulator stands in for the device |
| Frontend ↔ backend integration (REST, WebSocket) | Planned | adapters currently use in-memory fixtures |

---

## 3. Repository structure

```
SmartCare/
├── .github/workflows/ci.yml        # CI: Java, frontend, simulator
├── broker/                         # placeholder README; C-owned broker files stay in iot/broker/
├── docs/                           # cross-cutting documentation, prompts
│   ├── README.md
│   └── prompts/
├── frontends/
│   ├── frontoffice/                # patient PWA
│   ├── backoffice/                 # professional + administrator PWA
│   ├── shared/                     # demo auth, domain rules, UI helpers
│   ├── tests/                      # Node test suites and integration driver example
│   ├── docs/
│   │   ├── api-proposal.md         # proposed (not implemented) REST/WebSocket routes
│   │   └── access-verification.md  # access-control scenarios and their status
│   └── README.md
├── iot/
│   ├── broker/                     # docker-compose.yml (Mosquitto + Node-RED), mosquitto.conf
│   ├── gateway/                    # Node-RED validation flow (flows/flows.json) + README
│   ├── simulator/                  # Python MQTT simulator, requirements.txt, tests/
│   ├── docs/                       # message-contract.md, data-collection.md,
│   │                               # model-card.md, SmartCare_Scope_Statement.pdf
│   └── README.md
├── middleware/                     # Jakarta EE backend (Maven reactor)
│   ├── core/                       # persistence, MQTT ingestion and CDI beans
│   ├── iam/                        # identity and access module scaffolding
│   ├── api/                        # JAX-RS application and health endpoints (WAR)
│   ├── pom.xml
│   └── README.md
├── scripts/                        # demo, recovery and MQTT publish helpers
│   └── README.md
├── attribution.md                  # origin of code and AI-usage declaration
└── README.md
```

Component documentation: [`middleware/README.md`](middleware/README.md), [`frontends/README.md`](frontends/README.md), [`iot/README.md`](iot/README.md), [`iot/gateway/README.md`](iot/gateway/README.md), [`iot/simulator/README.md`](iot/simulator/README.md), [`docs/README.md`](docs/README.md), [`scripts/README.md`](scripts/README.md), [`broker/README.md`](broker/README.md), [`iot/docs/message-contract.md`](iot/docs/message-contract.md).

---

## 4. Getting started

### Prerequisites

| Tool | Used for |
| --- | --- |
| Docker Desktop | Mosquitto and Node-RED |
| Python 3.8+ (3.12 in CI) | MQTT simulator |
| Node.js 22 | Frontend tests |
| Java 25 (JDK) and Maven 3.9+ | Backend build |
| WildFly 42.0.0.Final | Deploying the backend WAR |
| MongoDB on `localhost:27017` | Backend persistence and its integration tests |

Commands below are PowerShell (the team's development environment is Windows 11) and run from the repository root.

### 4.1 Start the broker and Node-RED

```powershell
docker volume create smartcare_nodered_data   # once: the volume is declared as external
docker compose -f iot/broker/docker-compose.yml up -d
```

- Mosquitto: `127.0.0.1:1883` (anonymous access, local development only)
- Node-RED: http://127.0.0.1:1880

### 4.2 Import the gateway flow

1. Open http://127.0.0.1:1880, then menu → **Import**.
2. Select `iot/gateway/flows/flows.json` and import it.
3. Open the **SmartCare Mosquitto** broker node and check: server `smartcare-mosquitto`, port `1883`, no credentials.
4. Click **Deploy** and confirm the MQTT nodes show *connected*.

Details and troubleshooting: [`iot/gateway/README.md`](iot/gateway/README.md).

### 4.3 Run the simulator

```powershell
py -3 -m venv .venv-simulator
.\.venv-simulator\Scripts\python.exe -m pip install -r iot/simulator/requirements.txt
.\.venv-simulator\Scripts\python.exe iot/simulator/simulator.py --scenario normal
```

Scenarios: `normal`, `spike`, `sustained`, `missing`, `duplicates`, `disconnect`, `invalid`, `all`. Options: `--host`, `--port`, `--device-id`, `--seed`.

Watch the gateway output:

```powershell
docker exec -it smartcare-mosquitto mosquitto_sub -h localhost -t "smartcare/v1/validated/#" -t "smartcare/v1/rejected/#" -v
```

### 4.4 Build and deploy the backend

```powershell
mvn -f middleware/pom.xml clean package            # produces middleware\api\target\smartcare.war
$wildfly = "<path-to-wildfly-42.0.0.Final>"
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\middleware\api\target\smartcare.war --force"
curl http://localhost:8080/smartcare/api/health          # {"status":"ok"}
curl http://localhost:8080/smartcare/api/health/database # 200 if MongoDB and schema are ready, 503 otherwise
curl http://localhost:8080/smartcare/api/health/ingestion # broker state and ingestion counters
```

The URL is composed of `/smartcare` (WAR name), `/api` (`@ApplicationPath`) and the resource `@Path`. The MQTT receiver starts with the application and uses the environment variables in [section 9](#9-configuration); a missing broker does not block deployment.

### 4.5 Run the frontend

```powershell
py -3 -m http.server 8080 --bind 127.0.0.1
```

Then open http://127.0.0.1:8080/frontends/frontoffice/ and http://127.0.0.1:8080/frontends/backoffice/. Do not open the files with `file://`: modules and service workers need HTTP. If WildFly is running on port 8080, use another port (for example 8081). Demo accounts are listed in [`frontends/README.md`](frontends/README.md).

---

## 5. MQTT topics and message contract

| Topic | Purpose |
| --- | --- |
| `smartcare/v1/raw/{deviceId}` | Measurements published by the simulator or a device |
| `smartcare/v1/validated/{deviceId}` | Measurements accepted by the gateway |
| `smartcare/v1/rejected/{deviceId}` | Rejected messages, with a `reason` |
| `smartcare/v1/status/{deviceId}` | Reserved, not implemented |

Example raw measurement (JSON, UTF-8, QoS 1, no retain):

```json
{
  "schemaVersion": 1,
  "deviceId": "sc-001",
  "bootId": "c0f2e7a5-97bc-4f5b-aed9-859f16c38b6a",
  "sequence": 1,
  "acquiredAtUtc": "2026-11-08T20:00:00Z",
  "heartRate": 78,
  "spo2": 98,
  "quality": "good",
  "reason": null,
  "clockStatus": "synced",
  "source": "simulated"
}
```

A logical measurement is identified by `(deviceId, bootId, sequence)`. QoS 1 can redeliver, so the backend deduplicates on this key. There is no `patientId` in the message: the device-to-patient association is owned by the backend. The backend subscribes to `smartcare/v1/validated/#`, revalidates the payload (including schema version, identifiers, topic, timestamp, quality, ranges and clock status), and stores accepted measurements. The contract is *observed from the simulator* and still has to be validated by the team; see [`iot/docs/message-contract.md`](iot/docs/message-contract.md).

---

## 6. Backend and data model

The backend (`middleware/`, Maven reactor with `core`, `iam` and `api`, Jakarta EE 11, JAX-RS, MongoDB sync driver, Eclipse Paho MQTT v3) currently provides the persistence layer, the validated-topic MQTT receiver and three health endpoints. The `api` module produces the WAR.

`SchemaInitializer` creates the following MongoDB collections with JSON-schema validators and indexes (database `smartcare`):

| Collection | Content |
| --- | --- |
| `measurements` | Physiological measurements; unique index `uq_device_boot_sequence` on `(deviceId, bootId, sequence)` |
| `devices` | Registered devices |
| `device_ownership` | Device-to-owner association |
| `users` | Platform users |
| `assignments` | Professional-to-patient assignments |

Planned collections (not created yet): `scores`, `alerts`, `audit`, `configuration`.

---

## 7. REST API

Base path: `/smartcare/api`

| Method | Path | Status |
| --- | --- | --- |
| GET | `/health` | Implemented: `{"status":"ok"}` |
| GET | `/health/database` | Implemented: 200 when MongoDB and the schema are ready, 503 otherwise |
| GET | `/health/ingestion` | Implemented: 200/503 plus broker state and ingestion counters |
| various | `/auth`, `/me`, `/patients`, `/alerts`, `/admin/*`, `/events` (WebSocket) | **Proposed, not implemented**: [`frontends/docs/api-proposal.md`](frontends/docs/api-proposal.md) |

The generic resources `/users`, `/devices`, `/measurements`, `/scores`, `/alerts` and `/configuration` from the original design are not implemented yet.

---

## 8. Frontend (PWAs)

Two native HTML/CSS/JavaScript applications, no npm install and no build step:

- **Patient** (`frontends/frontoffice/`): dashboard (heart rate, SpO₂, quality, charts), paginated history with CSV export, alerts, device status.
- **Supervision** (`frontends/backoffice/`): professional view (assigned patients, details, alerts and acknowledgement) and administrator view (accounts, assignments, devices, service and model status; no clinical data).

The two apps have separate manifests, scopes, icons and service-worker caches. They currently run on in-memory demo fixtures: the login is a **non-secure demonstration** with public credentials, and nothing is persisted in `localStorage`, `sessionStorage`, IndexedDB or caches. Real backend integration (REST, WebSocket, server-side authorization) is pending; see [`frontends/docs/access-verification.md`](frontends/docs/access-verification.md) for the access scenarios waiting on it.

---

## 9. Configuration

All backend configuration is provided through environment variables. Credentials and secrets are never committed.

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DATABASE` | Database name | `smartcare` |
| `MQTT_ENABLED` | Start the validated-topic receiver | `true` |
| `MQTT_BROKER_URL` | MQTT broker URI | `tcp://localhost:1883` |
| `MQTT_TOPIC` | Subscription filter | `smartcare/v1/validated/#` |
| `MQTT_CLIENT_ID` | Stable Paho client id | `smartcare-middleware` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | Optional broker credentials | unset |
| `MQTT_QOS` | Subscription QoS | `1` |
| `MQTT_CLEAN_SESSION` | Paho clean-session flag | `false` |
| `MQTT_ACCEPTED_CLOCK_STATUS` | Comma-separated accepted clock states | `synced` |

The simulator is configured through CLI options (`--host`, `--port`, `--device-id`, `--seed`).

---

## 10. Security

Implemented:

- Secrets supplied through environment variables, never stored in source control.
- Input validation at the gateway (structure, schema version, ranges, duplicates), independent revalidation in the backend ingestion handler, and schema validation in MongoDB.
- Role guards and assignment checks in the **frontend demo** (not a security boundary).

Planned: authentication and role-based authorization in the backend, ownership checks, device authorization on the MQTT path, audit logging.

Known development-only settings: Mosquitto allows anonymous access and has no TLS. Do not expose port 1883 to untrusted networks.

---

## 11. Testing and CI

| Suite | Command | Notes |
| --- | --- | --- |
| Simulator | `python -m unittest iot.simulator.tests.test_simulator -v` | No broker required |
| Frontend | `node --test frontends/tests/frontend.test.mjs frontends/tests/access-demo.test.mjs` | Node 22, no dependencies |
| Backend | `mvn --batch-mode --no-transfer-progress -f middleware/pom.xml verify` | Integration tests need MongoDB on `localhost:27017` and Mosquitto on `localhost:1883` |
| Gateway | manual | See [`iot/gateway/README.md`](iot/gateway/README.md); no automated gateway test yet |

Server-side access scenarios in `frontends/tests/integration/access-server.test.mjs` are reported as *skipped/blocked* until the backend routes exist; they are not counted as passing tests.

GitHub Actions (`.github/workflows/ci.yml`) runs three jobs on every push and pull request: **java** (MongoDB service plus Mosquitto container, `mvn -f middleware/pom.xml verify`, JDK 25), **frontend** (file checks, `node --check`, `node --test`) and **simulator** (syntax check and unittest). The Java job fails if any Surefire test is skipped.

---

## 12. Git workflow and academic integrity

- `main` is the evaluated branch. Integrate early and often; do not leave work on isolated branches.
- Open a Pull Request for each feature, reviewed and approved by another team member, then merge into `main`.
- Never commit `target/`, logs, IDE metadata, `.env` files (except `.env.example`), passwords, API keys or database credentials.
- [`attribution.md`](attribution.md) must stay at the repository root and be updated every sprint with the origin of code and the use of AI assistants.

---

## 13. Limitations

- Educational prototype; not validated for any clinical use.
- Measurements and anomaly scores are experimental estimates, not diagnoses.
- No real device yet: data comes from the simulator.
- The backend consumes validated MQTT messages but does not yet expose business endpoints, raise alerts or enforce authentication; the PWAs run on demo data. The gateway-to-receiver path has not been automated end to end, because Node-RED is not available in CI.
- The frontend has not been checked in a real browser, on a physical phone, or installed as a PWA (see [`frontends/README.md`](frontends/README.md)).
