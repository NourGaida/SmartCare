
import json
import time
import uuid
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# MQTT configuration
BROKER_HOST = "localhost"
BROKER_PORT = 1883

DEVICE_ID = "sc-001"
PATIENT_ID = "patient-001"
BOOT_ID = str(uuid.uuid4())

READINGS_TOPIC = f"smartcare/v1/raw/{DEVICE_ID}"
STATUS_TOPIC = f"smartcare/v1/status/{DEVICE_ID}"

sequence = 0


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def create_reading(hr, spo2, quality="good", reason=None):

    global sequence
    sequence += 1

    return {
        "schemaVersion": 1,
        "deviceId": DEVICE_ID,
        "bootId": BOOT_ID,
        "sequence": sequence,
        "acquiredAtUtc": utc_now(),
        "heartRate": hr,
        "spo2": spo2,
        "quality": quality,
        "reason": reason,
        "clockStatus": "synced",
        "source": "simulated"
    }


def publish(client, topic, payload):

    message = json.dumps(payload)

    result = client.publish(topic, message, qos=1)
    result.wait_for_publish()

    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError("MQTT publishing failed")

    print(f"\nPublished to: {topic}")
    print(json.dumps(payload, indent=2))


def send_normal(client):

    print("\n--- NORMAL READINGS ---")

    for _ in range(5):
        reading = create_reading(75, 98)
        publish(client, READINGS_TOPIC, reading)
        time.sleep(1)


def send_spike(client):

    print("\n--- ISOLATED SPIKE ---")

    reading = create_reading(180, 98)
    publish(client, READINGS_TOPIC, reading)


def send_sustained_abnormal(client):

    print("\n--- SUSTAINED ABNORMAL READINGS ---")

    for _ in range(12):
        reading = create_reading(125, 93)
        publish(client, READINGS_TOPIC, reading)
        time.sleep(1)


def send_missing_data(client):

    print("\n--- MISSING DATA ---")

    reading = create_reading(
        None,
        None,
        quality="invalid",
        reason="no_finger"
    )

    publish(client, READINGS_TOPIC, reading)


def send_duplicate(client):

    print("\n--- DUPLICATE MESSAGE ---")

    reading = create_reading(76, 98)

    publish(client, READINGS_TOPIC, reading)

    # Send exactly the same message again.
    publish(client, READINGS_TOPIC, reading)


def send_disconnect(client):

    print("\n--- DEVICE DISCONNECTION ---")

    event = {
        "deviceId": DEVICE_ID,
        "bootId": BOOT_ID,
        "status": "disconnected",
        "timestamp": utc_now(),
        "reason": "simulated_disconnect"
    }

    publish(client, STATUS_TOPIC, event)


def main():

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id="smartcare-simulator"
    )

    print("Connecting to MQTT broker...")

    client.connect(BROKER_HOST, BROKER_PORT, 60)
    client.loop_start()

    try:
        if not client.wait_for_connect(timeout=10):
            raise RuntimeError("Could not connect to MQTT broker")

        print("Connected successfully!")

        send_normal(client)
        send_spike(client)
        send_sustained_abnormal(client)
        send_missing_data(client)
        send_duplicate(client)
        send_disconnect(client)

        print("\nAll scenarios completed!")

    finally:
        client.disconnect()
        client.loop_stop()


if __name__ == "__main__":
    main()
