
import json
from collections import defaultdict, deque
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import requests

BROKER = "127.0.0.1"
PORT = 1883
TOPIC = "smartcare/v1/devices/+/readings"
API_URL = "http://127.0.0.1:8001/predict"

WINDOW_SIZE = 5

# One independent window per device and patient.
buffers = defaultdict(lambda: deque(maxlen=WINDOW_SIZE))


def parse_timestamp(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("Timestamp must include a timezone")
    return int(dt.astimezone(timezone.utc).timestamp())


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("Connected to MQTT")
        client.subscribe(TOPIC)
        print("Subscribed to:", TOPIC)
    else:
        print("MQTT connection failed:", reason_code)


def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode("utf-8"))

        device_id = data["deviceId"]
        patient_id = data["patientId"]
        timestamp = parse_timestamp(data["timestamp"])

        if (
            data.get("valid") is not True
            or data.get("quality") != "GOOD"
        ):
            buffers.pop((device_id, patient_id), None)
            print("Invalid measurement ignored")
            return

        hr = float(data["heartRate"])
        spo2 = float(data["spo2"])

        if not (30 <= hr <= 220 and 50 <= spo2 <= 100):
            buffers.pop((device_id, patient_id), None)
            print("Out-of-range measurement ignored")
            return

        key = (device_id, patient_id)
        buffer = buffers[key]

        # Require strictly consecutive 1-second samples.
        if buffer:
            last_timestamp = buffer[-1]["timestampSeconds"]

            if timestamp != last_timestamp + 1:
                buffer.clear()
                print("Timestamp gap or duplicate: window reset")

        buffer.append({
            "timestampSeconds": timestamp,
            "heartRate": hr,
            "spo2": spo2,
        })

        print(
            f"Device={device_id}, Patient={patient_id}, "
            f"Window={len(buffer)}/{WINDOW_SIZE}"
        )

        if len(buffer) < WINDOW_SIZE:
            return

        payload = {
            "deviceId": device_id,
            "measurements": list(buffer),
        }

        response = requests.post(
            API_URL,
            json=payload,
            timeout=10,
        )
        response.raise_for_status()

        result = response.json()

        print("\n--- ML PREDICTION ---")
        print("Device:", device_id)
        print("Patient:", patient_id)
        print("Score:", result["anomalyScore"])
        print("Flagged:", result["flagged"])
        print("Mode:", result["mode"])
        print("---------------------\n")

    except (ValueError, KeyError, TypeError) as exc:
        print("Invalid MQTT message:", exc)
    except requests.RequestException as exc:
        print("FastAPI request failed:", exc)


client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER, PORT, 60)
print("SmartCare MQTT inference consumer started...")
client.loop_forever()
