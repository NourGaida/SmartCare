from datetime import datetime, timezone
from uuid import UUID

import sys
from pathlib import Path

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1])
)

from event_manager import DetectionEvent
from event_serializer import serialize_event


def test_serialize_detection_event():
    event = DetectionEvent(
        device_id="sc-001",
        sequence=22,
        event_type="SUSTAINED_ANOMALY_CONFIRMED",
        anomaly_type="LOW_SPO2",
        started_sequence=11,
    )

    payload = serialize_event(event, "boot-001")

    assert payload["schemaVersion"] == 1
    assert payload["deviceId"] == "sc-001"
    assert payload["bootId"] == "boot-001"
    assert payload["sequence"] == 22
    assert payload["startedSequence"] == 11
    assert payload["eventType"] == "SUSTAINED_ANOMALY_CONFIRMED"
    assert payload["anomalyType"] == "LOW_SPO2"
    assert payload["source"] == "smartcare-detector"

    UUID(payload["eventId"])

    timestamp = datetime.fromisoformat(
        payload["detectedAtUtc"].replace("Z", "+00:00")
    )
    assert timestamp.tzinfo is not None
    assert timestamp.utcoffset() == timezone.utc.utcoffset(timestamp)


def test_same_event_has_stable_id():
    event = DetectionEvent(
        device_id="sc-001",
        sequence=22,
        event_type="SUSTAINED_ANOMALY_CONFIRMED",
        anomaly_type="LOW_SPO2",
    )

    first = serialize_event(event, "boot-001")
    second = serialize_event(event, "boot-001")

    assert first["eventId"] == second["eventId"]


def test_different_events_have_different_ids():
    first_event = DetectionEvent(
        device_id="sc-001",
        sequence=11,
        event_type="ANOMALY_STARTED",
        anomaly_type="LOW_SPO2",
    )

    second_event = DetectionEvent(
        device_id="sc-001",
        sequence=22,
        event_type="SUSTAINED_ANOMALY_CONFIRMED",
        anomaly_type="LOW_SPO2",
    )

    first = serialize_event(first_event, "boot-001")
    second = serialize_event(second_event, "boot-001")

    assert first["eventId"] != second["eventId"]
