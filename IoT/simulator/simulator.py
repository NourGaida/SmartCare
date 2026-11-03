"""Reproducible SmartCare scenarios, with an injectable clock and transport."""

import argparse
import json
import os
import random
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt


SCENARIOS = ("normal", "spike", "sustained", "missing", "duplicates",
             "disconnect", "invalid")
MQTT_TIMEOUT = 10


class Clock:
    def now(self):
        return datetime.now(timezone.utc)

    def monotonic(self):
        return time.monotonic()

    def sleep(self, seconds):
        time.sleep(seconds)


class MqttTransport:
    """QoS 1 publications acknowledged by the broker within a bounded wait."""

    def __init__(self, host="localhost", port=1883):
        self.host = host
        self.port = port
        self._connected = threading.Event()
        self._reason_code = None
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="smartcare-simulator-{}-{}".format(os.getpid(), uuid.uuid4().hex),
            reconnect_on_failure=False,
        )
        self._client.connect_timeout = MQTT_TIMEOUT
        self._client.on_connect = self._on_connect

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        self._reason_code = reason_code
        self._connected.set()

    def connect(self):
        self._connected.clear()
        self._reason_code = None
        started = time.monotonic()
        result = self._client.connect(self.host, self.port, keepalive=60)
        if result != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError("MQTT connection failed: {}".format(result))
        result = self._client.loop_start()
        if result != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError("MQTT network loop failed: {}".format(result))
        remaining = max(0, MQTT_TIMEOUT - (time.monotonic() - started))
        if not self._connected.wait(timeout=remaining):
            raise RuntimeError("MQTT connection timed out after 10 seconds")
        if self._reason_code != 0:
            raise RuntimeError("MQTT connection rejected: {}".format(self._reason_code))
        if not self._client.is_connected():
            raise RuntimeError("MQTT connection lost before publishing")

    def publish(self, topic, payload):
        result = self._client.publish(topic, payload, qos=1)
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError("MQTT publishing failed: {}".format(result.rc))
        result.wait_for_publish(timeout=MQTT_TIMEOUT)
        if not result.is_published():
            raise RuntimeError("MQTT publication not acknowledged within 10 seconds")
        print("{} {}".format(topic, payload))

    def close(self):
        try:
            self._client.disconnect()
        finally:
            self._client.loop_stop()
            self._connected.clear()


class Simulator:
    def __init__(self, transport, clock=None, device_id="sc-001", seed=42,
                 boot_id=None):
        self.transport = transport
        self.clock = clock if clock is not None else Clock()
        self.device_id = device_id
        self.boot_id = boot_id if boot_id is not None else str(uuid.uuid4())
        self.sequence = 0
        self.random = random.Random(seed)
        self.topic = "smartcare/v1/raw/{}".format(device_id)
        self._next_slot = None

    def _reading(self, heart_rate, spo2, quality="good", reason=None):
        self.sequence += 1
        return {
            "schemaVersion": 1,
            "deviceId": self.device_id,
            "bootId": self.boot_id,
            "sequence": self.sequence,
            "acquiredAtUtc": self.clock.now().isoformat(),
            "heartRate": heart_rate,
            "spo2": spo2,
            "quality": quality,
            "reason": reason,
            "clockStatus": "synced",
            "source": "simulated",
        }

    def _publish(self, reading):
        self.transport.publish(self.topic, json.dumps(reading, allow_nan=False))

    def _tick(self):
        # Account for publication time instead of adding it to every interval.
        self._next_slot += 1
        self.clock.sleep(max(0, self._next_slot - self.clock.monotonic()))

    def _send(self, heart_rate, spo2, quality="good", reason=None):
        self._publish(self._reading(heart_rate, spo2, quality, reason))
        self._tick()

    def _normal(self, count):
        for _ in range(count):
            self._send(75 + self.random.randint(-3, 3),
                       98 + self.random.randint(-1, 1))

    def _scenario_normal(self):
        self._normal(15)

    def _scenario_spike(self):
        self._normal(10)
        self._send(180, 98)
        self._normal(15)

    def _scenario_sustained(self):
        self._normal(10)
        for _ in range(12):
            self._send(125, 93)
        self._normal(15)

    def _scenario_missing(self):
        self._normal(5)
        for _ in range(6):
            self.sequence += 1
            self._tick()
        self._normal(10)

    def _scenario_duplicates(self):
        reading = self._reading(75, 98)
        self._publish(reading)
        self._publish(reading)
        self._tick()

    def _scenario_disconnect(self):
        self._normal(5)
        self.transport.close()
        self.clock.sleep(35)
        self.transport.connect()
        self._next_slot = self.clock.monotonic()
        self._normal(10)

    def _scenario_invalid(self):
        self._normal(5)
        for _ in range(3):
            self._send(None, None, quality="invalid", reason="no_finger")
        self._normal(10)

    def run(self, scenario="all"):
        if scenario not in SCENARIOS + ("all",):
            raise ValueError("Unknown scenario: {}".format(scenario))
        try:
            self.transport.connect()
            self._next_slot = self.clock.monotonic()
            for name in SCENARIOS if scenario == "all" else (scenario,):
                print("Scenario: {}".format(name))
                getattr(self, "_scenario_" + name)()
        finally:
            self.transport.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=SCENARIOS + ("all",), default="all")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--device-id", default="sc-001")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    if not args.device_id or any(char in args.device_id for char in "/+#\x00"):
        parser.error("--device-id must be a nonempty MQTT topic segment")
    return args


def main(argv=None):
    args = parse_args(argv)
    try:
        Simulator(MqttTransport(args.host, args.port),
                  device_id=args.device_id, seed=args.seed).run(args.scenario)
    except KeyboardInterrupt:
        print("Simulator interrupted", file=sys.stderr)
        return 130
    except (OSError, RuntimeError, ValueError) as error:
        print("Simulator failed: {}".format(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
