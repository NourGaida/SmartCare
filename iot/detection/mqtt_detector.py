from pathlib import Path
import json
import logging
import os

import paho.mqtt.client as mqtt

from duration_detector import DurationDetector
from event_manager import EventManager
from event_serializer import serialize_event


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger("smartcare.detector")

MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = "smartcare/v1/validated/+"
MQTT_EVENTS_TOPIC = "smartcare/v1/detection/events"

detector = DurationDetector(
    required_consecutive=3,
    required_duration_seconds=10,
    max_gap_seconds=3,
)

event_manager = EventManager()


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code != 0:
        logger.error("MQTT connection failed: %s", reason_code)
        return

    logger.info("Connected to Mosquitto")
    client.subscribe(MQTT_TOPIC, qos=1)
    logger.info("Subscribed to %s", MQTT_TOPIC)


def on_message(client, userdata, msg):
    try:
        measurement = json.loads(msg.payload.decode("utf-8"))

        if not isinstance(measurement, dict):
            raise ValueError("Expected a JSON object")

        expected_topic = (
            f"smartcare/v1/validated/{measurement['deviceId']}"
        )

        if msg.topic != expected_topic:
            raise ValueError("MQTT topic/deviceId mismatch")

        result = detector.detect(measurement)

        logger.info(
            "device=%s seq=%s status=%s type=%s "
            "count=%s duration=%.1fs",
            result.device_id,
            result.sequence,
            result.status,
            result.anomaly_type,
            result.consecutive_count,
            result.duration_seconds,
        )

        event = event_manager.process(
            result,
            measurement["bootId"],
        )

        if event is not None:
            payload = serialize_event(
                event,
                measurement["bootId"],
            )

            message = json.dumps(payload)

            publish_info = client.publish(
                MQTT_EVENTS_TOPIC,
                payload=message,
                qos=1,
                retain=False,
            )

            if publish_info.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.error(
                    "MQTT event publish failed: rc=%s",
                    publish_info.rc,
                )
            else:
                logger.warning(
                    "EVENT PUBLISHED | device=%s seq=%s event=%s type=%s",
                    event.device_id,
                    event.sequence,
                    event.event_type,
                    event.anomaly_type,
                )

    except (ValueError, KeyError, TypeError, UnicodeDecodeError) as exc:
        logger.warning(
            "Rejected message on %s: %s",
            msg.topic,
            exc,
        )
    except Exception:
        logger.exception("Unexpected detection error")



def acquire_instance_lock():
    """Prevent two local detector instances on Windows."""
    import msvcrt
    import tempfile

    lock_path = Path(tempfile.gettempdir()) / "smartcare-duration-detector.lock"
    lock_file = open(lock_path, "a+b")

    try:
        lock_file.seek(0)
        lock_file.write(b"0")
        lock_file.flush()
        lock_file.seek(0)
        msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        lock_file.close()
        raise RuntimeError(
            "Another SmartCare detector instance is already running"
        )

    return lock_file


def main():
    lock_file = acquire_instance_lock()

    try:
        run_detector()
    finally:
        lock_file.close()


def run_detector():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="smartcare-duration-detector",
    )

    client.on_connect = on_connect
    client.on_message = on_message

    logger.info(
        "Connecting to MQTT broker %s:%s",
        MQTT_HOST,
        MQTT_PORT,
    )

    client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)

    try:
        client.loop_forever(retry_first_connection=True)
    except KeyboardInterrupt:
        logger.info("Stopping detector")
    finally:
        client.disconnect()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        logger.error("%s", exc)
        raise SystemExit(1) from None