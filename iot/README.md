# IoT

MQTT ingestion components: broker configuration, Node-RED validation gateway, simulator and message contract.

## Components

| Path | Purpose |
| --- | --- |
| [`broker/`](broker/) | Mosquitto and Node-RED Docker Compose stack |
| [`gateway/`](gateway/) | Node-RED validation flow and gateway documentation |
| [`simulator/`](simulator/) | Python MQTT simulator with seven scenarios plus `all` |
| [`docs/`](docs/) | Message contract, data-collection notes, model card and scope statement |

The top-level [`broker/`](../broker/) directory contains only a placeholder README. The actual broker files are C-owned and remain in `iot/broker/`.

## Run the broker and gateway

```powershell
docker compose -f iot/broker/docker-compose.yml up -d
```

Then import [`gateway/flows/flows.json`](gateway/flows/flows.json) into Node-RED and open the editor at `http://localhost:1880`.

See [`gateway/README.md`](gateway/README.md) for the flow, topics, validation rules and troubleshooting.

## Run the simulator

```powershell
.\.venv-simulator\Scripts\python.exe -m pip install -r iot/simulator/requirements.txt
.\.venv-simulator\Scripts\python.exe iot/simulator/simulator.py --scenario normal
```

Scenarios: `normal`, `spike`, `sustained`, `missing`, `duplicates`, `disconnect`, `invalid`, `all`.

See [`simulator/README.md`](simulator/README.md) for options, expected output and tests.

## Tests

```powershell
python -m unittest iot.simulator.tests.test_simulator -v
```

The same command runs in CI. The simulator tests do not need a live broker.

## Message contract

The backend consumes the validated measurement shape documented in [`docs/message-contract.md`](docs/message-contract.md). The contract is observed from the simulator and still has to be validated by the team.
