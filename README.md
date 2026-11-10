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
        ▼   (planned)
 WildFly · Jakarta EE backend ──► MongoDB
        │
        ├──► business rules ──► alerts        (planned)
        └──► Python anomaly service ──► scores (planned)

 PWAs: patient · supervision (professional / administrator)
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
| Python MQTT simulator (7 scenarios + `all`) | Implemented, tested | `IoT/simulator/` |
| Mosquitto broker and Node-RED (Docker Compose) | Implemented | `IoT/broker/` |
| Node-RED validation gateway | Implemented, verified locally | `IoT/gateway/flows/flows.json` |
| MongoDB persistence (schema validators, indexes, deduplication, repository) | Implemented, tested | `MiddleWare/src/main/java/com/smartcare/persistence/` |
| Health endpoints (`/health`, `/health/database`) | Implemented | `MiddleWare/src/main/java/com/smartcare/api/` |
| Patient PWA (demo data) | Implemented, demo only | `frontend/patient/` |
| Supervision PWA (professional and administrator, demo data) | Implemented, demo only | `frontend/supervision/` |
| Continuous integration (Java, frontend, simulator) | Implemented | `.github/workflows/ci.yml` |
| Backend ingestion of validated MQTT messages | Planned | not in `MiddleWare/` yet |
| REST resources for users, devices, measurements, alerts, scores, configuration | Planned | see [`frontend/api-proposal.md`](frontend/api-proposal.md) |
| Authentication, role-based authorization, audit log | Planned | frontend uses a non-secure demo login |
| Business rules and alert creation | Planned | |
| Python anomaly service (scores) | Planned | only [`IoT/docs/model-card.md`](IoT/docs/model-card.md) exists |
| ESP32 + MAX30102 firmware | Planned | the simulator stands in for the device |
| Frontend ↔ backend integration (REST, WebSocket) | Planned | adapters currently use in-memory fixtures |

---

## 3. Repository structure

```
SmartCare/
├── .github/workflows/ci.yml        # CI: Java, frontend, simulator
├── IoT/
│   ├── broker/                     # docker-compose.yml (Mosquitto + Node-RED), mosquitto.conf
│   ├── gateway/                    # Node-RED validation flow (flows/flows.json) + README
│   ├── simulator/                  # Python MQTT simulator, requirements.txt, tests/
│   └── docs/                       # message-contract.md, data-collection.md,
│                                   # model-card.md, SmartCare_Scope_Statement.pdf
├── MiddleWare/                     # Jakarta EE backend (Maven WAR sources)
│   └── src/
│       ├── main/java/com/smartcare/
│       │   ├── api/                # SmartCareApplication, HealthSource, DatabaseHealthSource
│       │   └── persistence/        # MongoProvider, SchemaInitializer, Measurement, repository...
│       ├── main/webapp/WEB-INF/beans.xml
│       └── test/java/com/smartcare/persistence/
├── frontend/
│   ├── patient/                    # patient PWA
│   ├── supervision/                # professional + administrator PWA
│   ├── shared/                     # demo auth, domain rules, UI helpers
│   ├── tests/                      # Node test suites
│   ├── api-proposal.md             # proposed (not implemented) REST/WebSocket routes
│   └── access-verification.md      # access-control scenarios and their status
├── ATTRIBUTION.md                  # origin of code and AI-usage declaration
├── pom.xml
└── README.md
```

Component documentation: [`IoT/gateway/README.md`](IoT/gateway/README.md), [`IoT/simulator/README.md`](IoT/simulator/README.md), [`frontend/README.md`](frontend/README.md), [`IoT/docs/message-contract.md`](IoT/docs/message-contract.md).

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
docker compose -f IoT/broker/docker-compose.yml up -d
```

- Mosquitto: `127.0.0.1:1883` (anonymous access, local development only)
- Node-RED: http://127.0.0.1:1880

### 4.2 Import the gateway flow

1. Open http://127.0.0.1:1880, then menu → **Import**.
2. Select `IoT/gateway/flows/flows.json` and import it.
3. Open the **SmartCare Mosquitto** broker node and check: server `smartcare-mosquitto`, port `1883`, no credentials.
4. Click **Deploy** and confirm the MQTT nodes show *connected*.

Details and troubleshooting: [`IoT/gateway/README.md`](IoT/gateway/README.md).

### 4.3 Run the simulator

```powershell
py -3 -m venv .venv-simulator
.\.venv-simulator\Scripts\python.exe -m pip install -r IoT/simulator/requirements.txt
.\.venv-simulator\Scripts\python.exe IoT/simulator/simulator.py --scenario normal
```

Scenarios: `normal`, `spike`, `sustained`, `missing`, `duplicates`, `disconnect`, `invalid`, `all`. Options: `--host`, `--port`, `--device-id`, `--seed`.

Watch the gateway output:

```powershell
docker exec -it smartcare-mosquitto mosquitto_sub -h localhost -t "smartcare/v1/validated/#" -t "smartcare/v1/rejected/#" -v
```

### 4.4 Build and deploy the backend

```powershell
mvn clean package            # produces target\smartcare.war
$wildfly = "<path-to-wildfly-42.0.0.Final>"
& "$wildfly\bin\jboss-cli.bat" --connect --command="deploy <path-to-repo>\target\smartcare.war --force"
curl http://localhost:8080/smartcare/api/health          # {"status":"ok"}
curl http://localhost:8080/smartcare/api/health/database # 200 if MongoDB and schema are ready, 503 otherwise
```

The URL is composed of `/smartcare` (WAR name), `/api` (`@ApplicationPath`) and the resource `@Path`.

### 4.5 Run the frontend

```powershell
py -3 -m http.server 8080 --bind 127.0.0.1
```

Then open http://127.0.0.1:8080/frontend/patient/ and http://127.0.0.1:8080/frontend/supervision/. Do not open the files with `file://`: modules and service workers need HTTP. If WildFly is running on port 8080, use another port (for example 8081). Demo accounts are listed in [`frontend/README.md`](frontend/README.md).

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

A logical measurement is identified by `(deviceId, bootId, sequence)`. QoS 1 can redeliver, so the backend deduplicates on this key. There is no `patientId` in the message: the device-to-patient association is owned by the backend. The contract is *observed from the simulator* and still has to be validated by the team; see [`IoT/docs/message-contract.md`](IoT/docs/message-contract.md).

---

## 6. Backend and data model

The backend (`MiddleWare/`, Maven WAR, Jakarta EE 11, JAX-RS, MongoDB sync driver) currently provides the persistence layer and two health endpoints.

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
| various | `/auth`, `/me`, `/patients`, `/alerts`, `/admin/*`, `/events` (WebSocket) | **Proposed, not implemented**: [`frontend/api-proposal.md`](frontend/api-proposal.md) |

The generic resources `/users`, `/devices`, `/measurements`, `/scores`, `/alerts` and `/configuration` from the original design are not implemented yet.

---

## 8. Frontend (PWAs)

Two native HTML/CSS/JavaScript applications, no npm install and no build step:

- **Patient** (`frontend/patient/`): dashboard (heart rate, SpO₂, quality, charts), paginated history with CSV export, alerts, device status.
- **Supervision** (`frontend/supervision/`): professional view (assigned patients, details, alerts and acknowledgement) and administrator view (accounts, assignments, devices, service and model status; no clinical data).

The two apps have separate manifests, scopes, icons and service-worker caches. They currently run on in-memory demo fixtures: the login is a **non-secure demonstration** with public credentials, and nothing is persisted in `localStorage`, `sessionStorage`, IndexedDB or caches. Real backend integration (REST, WebSocket, server-side authorization) is pending; see [`frontend/access-verification.md`](frontend/access-verification.md) for the access scenarios waiting on it.

---

## 9. Configuration

All backend configuration is provided through environment variables. Credentials and secrets are never committed.

| Variable | Purpose | Default |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DATABASE` | Database name | `smartcare` |

The simulator is configured through CLI options (`--host`, `--port`, `--device-id`, `--seed`).

---

## 10. Security

Implemented:

- Secrets supplied through environment variables, never stored in source control.
- Input validation at the gateway (structure, schema version, ranges, duplicates) and schema validation in MongoDB.
- Role guards and assignment checks in the **frontend demo** (not a security boundary).

Planned: authentication and role-based authorization in the backend, ownership checks, device authorization on the MQTT path, audit logging.

Known development-only settings: Mosquitto allows anonymous access and has no TLS. Do not expose port 1883 to untrusted networks.

---

## 11. Testing and CI

| Suite | Command | Notes |
| --- | --- | --- |
| Simulator | `python -m pytest IoT/simulator/tests -v` | No broker required |
| Frontend | `node --test frontend/tests/frontend.test.mjs frontend/tests/access-demo.test.mjs` | Node 22, no dependencies |
| Backend | `mvn --batch-mode --no-transfer-progress verify` | The persistence integration tests need MongoDB on `localhost:27017` |
| Gateway | manual | See [`IoT/gateway/README.md`](IoT/gateway/README.md); no automated gateway test yet |

Server-side access scenarios in `frontend/tests/integration/access-server.test.mjs` are reported as *skipped/blocked* until the backend routes exist; they are not counted as passing tests.

GitHub Actions (`.github/workflows/ci.yml`) runs three jobs on every push and pull request: **java** (`mvn verify`, JDK 25), **frontend** (file checks, `node --check`, `node --test`) and **simulator** (syntax check and pytest).

---

## 12. Git workflow and academic integrity

- `main` is the evaluated branch. Integrate early and often; do not leave work on isolated branches.
- Open a Pull Request for each feature, reviewed and approved by another team member, then merge into `main`.
- Never commit `target/`, logs, IDE metadata, `.env` files (except `.env.example`), passwords, API keys or database credentials.
- [`ATTRIBUTION.md`](ATTRIBUTION.md) must stay at the repository root and be updated every sprint with the origin of code and the use of AI assistants.

---

## 13. Limitations

- Educational prototype; not validated for any clinical use.
- Measurements and anomaly scores are experimental estimates, not diagnoses.
- No real device yet: data comes from the simulator.
- The backend does not yet consume MQTT, expose business endpoints or enforce authentication; the PWAs run on demo data.
- The frontend has not been checked in a real browser, on a physical phone, or installed as a PWA (see [`frontend/README.md`](frontend/README.md)).
