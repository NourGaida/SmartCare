# Broker

This directory is a top-level placeholder for the MQTT broker area. The broker configuration is C-owned and remains in [`iot/broker/`](../iot/broker/).

## Actual configuration

- `iot/broker/docker-compose.yml`: Mosquitto and Node-RED services.
- `iot/broker/mosquitto.conf`: broker listener and persistence settings.

Start the stack from the repository root:

```powershell
docker compose -f iot/broker/docker-compose.yml up -d
```

Do not duplicate or move the broker files into this directory. See [`iot/README.md`](../iot/README.md) and [`iot/gateway/README.md`](../iot/gateway/README.md) for the ingestion path.
