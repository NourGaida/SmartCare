# SmartCare MQTT Validation Gateway

This directory contains the **Node-RED validation gateway** for SmartCare. The gateway receives raw measurements from IoT devices or the Python simulator, checks their message structure and basic validity, and republishes them to separate MQTT topics for accepted and rejected messages.

> **Scope:** This gateway validates incoming data. It does **not** diagnose medical conditions, classify clinical anomalies, or send measurements to the backend by itself.

## Architecture

```text
Python simulator / IoT device
            |
            | smartcare/v1/raw/{deviceId}
            v
      Mosquitto broker
            |
            v
       Node-RED gateway
       JSON parsing + validation
            |
        +---+---+
        |       |
        v       v
    Valid     Rejected
        |       |
        v       v
smartcare/v1/validated/{deviceId}
smartcare/v1/rejected/{deviceId}
```

Both outputs are published to the Mosquitto broker. Other SmartCare services can subscribe to the appropriate topics.

## Repository files

```text
IoT/
├── broker/
│   └── mosquitto.conf
├── gateway/
│   ├── README.md
│   └── flows/
│       └── flows.json
└── simulator/
    ├── simulator.py
    └── tests/
        └── test_simulator.py
```

`flows/flows.json` is the exported Node-RED flow. The export includes the MQTT input, validation function, topic-setting nodes, debug nodes, MQTT outputs, and broker configuration node.

## Prerequisites

- Docker Desktop, with Docker running
- A Mosquitto MQTT broker reachable from Node-RED
- Node-RED with MQTT nodes (included in standard Node-RED installations)
- Python and the simulator's dependencies **only if** you want to generate sample measurements

The commands below assume the local Docker containers are named `smartcare-mosquitto` and `smartcare-nodered`. Adjust names, network, and volume paths to match your own setup.

## 1. Start Mosquitto

The project broker configuration is in `IoT/broker/mosquitto.conf`:

```conf
listener 1883 0.0.0.0
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
```

For a local development setup, you can start Mosquitto from the **repository root** with PowerShell:

```powershell
docker run -d --name smartcare-mosquitto `
  -p 1883:1883 `
  -v "${PWD}/IoT/broker/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" `
  -v smartcare-mosquitto-data:/mosquitto/data `
  eclipse-mosquitto:2
```

If the container already exists, start it instead:

```powershell
docker start smartcare-mosquitto
```

**Security:** Anonymous MQTT access is enabled for local development only. Do not expose port 1883 to untrusted networks or production environments without authentication, authorization, and appropriate transport security.

## 2. Start Node-RED

If you already have a working Node-RED container, keep using it. Otherwise, one example local setup is:

```powershell
docker network create smartcare-iot

docker network connect smartcare-iot smartcare-mosquitto

docker run -d --name smartcare-nodered `
  --network smartcare-iot `
  -p 1880:1880 `
  -v smartcare-nodered-data:/data `
  nodered/node-red:latest
```

The `docker network create` and `docker network connect` commands are only needed once. If the network or connection already exists, reuse it rather than creating it again.

Open **http://localhost:1880**.

The named `/data` volume preserves Node-RED changes between container restarts. The exported `flows.json` in Git remains the shareable source copy of this gateway.

## 3. Import the flow

1. Open Node-RED at **http://localhost:1880**.
2. Open the top-right menu → **Import**.
3. Select `IoT/gateway/flows/flows.json` from this repository.
4. Import the flow into a workspace.
5. Open the **SmartCare Mosquitto** broker configuration node and verify:
   - **Server:** `smartcare-mosquitto` when both containers share a Docker network.
   - **Port:** `1883`.
   - **Credentials:** none for the local development configuration above.
6. Click **Deploy**.
7. Confirm that the MQTT nodes show a connected status.

If you use a different Docker network or a broker installed directly on your machine, update the broker hostname accordingly. `localhost` **inside the Node-RED container** refers to that container, not the host machine.

## 4. MQTT topics

| Topic | Purpose |
| --- | --- |
| `smartcare/v1/raw/{deviceId}` | Measurements published by the simulator or a device |
| `smartcare/v1/validated/{deviceId}` | Measurements accepted by the validation function |
| `smartcare/v1/rejected/{deviceId}` | Messages rejected with a reason |
| `smartcare/v1/status/{deviceId}` | Reserved for device status; not implemented by this validation flow |

The MQTT input subscribes to `smartcare/v1/raw/#`. The two MQTT output nodes use topics dynamically set by the preceding Node-RED `change` nodes.

### Example raw measurement

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

The gateway checks the schema version, device/boot identifiers, sequence, raw topic consistency, timestamp, quality, numeric measurement validity, plausible ranges, and duplicate sequences within the running flow context. The exact validation rules are defined in the **Validate SmartCare Measurements** function node in `flows.json`.

A physiologically unusual but structurally valid value, such as a heart rate of 180 bpm, can still be forwarded to `validated`: **validation is not the same as anomaly detection**.

### Example rejection

A message with an unsupported schema version:

```json
{"schemaVersion":999,"deviceId":"sc-001"}
```

is published to `smartcare/v1/rejected/sc-001` with a rejection payload similar to:

```json
{
  "deviceId": "sc-001",
  "reason": "invalid_schema_version",
  "receivedAtUtc": "2026-11-08T22:26:40.535Z",
  "originalMessage": {
    "schemaVersion": 999,
    "deviceId": "sc-001"
  }
}
```

The `receivedAtUtc` field is generated at runtime.

## 5. Test the gateway

Open one PowerShell terminal to watch both outputs:

```powershell
docker exec -it smartcare-mosquitto mosquitto_sub `
  -h localhost `
  -t "smartcare/v1/validated/#" `
  -t "smartcare/v1/rejected/#" `
  -v
```

### Test rejection

In a second PowerShell terminal, run:

```powershell
'{"schemaVersion":999,"deviceId":"sc-001"}' | docker exec -i smartcare-mosquitto mosquitto_pub `
  -h localhost `
  -t "smartcare/v1/raw/sc-001" `
  -s
```

Expected result: a message on `smartcare/v1/rejected/sc-001` with `reason: "invalid_schema_version"`.

Using stdin (`-s`) avoids PowerShell/Docker quote-escaping issues when publishing JSON.

### Test valid measurements

Run the SmartCare Python simulator using its supported CLI options and point it at the broker on `localhost:1883`. You can inspect its options with:

```powershell
python IoT/simulator/simulator.py --help
```

Subscribe to `smartcare/v1/validated/#` and confirm that correctly formed messages arrive. The simulator supports test scenarios including normal readings, spikes, invalid readings, duplicates, and disconnections.

### Run simulator unit tests

From the repository root, with the Python environment activated:

```powershell
python -m pytest IoT/simulator/tests -v
```

At the time this gateway flow was exported, the simulator test run reported **27 passed and 22 subtests passed**. These are simulator tests, not a complete automated test suite for the Node-RED gateway.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| MQTT nodes remain disconnected | Broker container is running; broker hostname and port are correct; both containers share a Docker network |
| No validated messages | Simulator is publishing to `smartcare/v1/raw/{deviceId}`; Node-RED flow is deployed; validation function output is connected |
| Messages are rejected unexpectedly | Inspect the `Rejected Measurements` debug node and its `reason` field |
| JSON is rejected as `invalid_json` | Check that the published payload is valid JSON; use the PowerShell stdin example above |
| Node-RED changes disappear after restart | Persist `/data` using a Docker volume and keep `flows.json` in Git |
| Output MQTT nodes have blank topic fields | This is intentional: `change` nodes set `msg.topic` dynamically |

## Current status and next steps

**Verified locally:**

- Python simulator unit tests pass.
- Mosquitto receives raw measurements.
- Node-RED routes accepted measurements to `validated`.
- Node-RED routes invalid measurements to `rejected` with a reason.
- The flow is exported to `IoT/gateway/flows/flows.json`.

**Still to be integrated or verified:**

- Downstream backend ingestion and storage.
- ML-based anomaly detection and alerting.
- End-to-end automated gateway integration tests.
- Production-grade MQTT authentication, access controls, and TLS.

