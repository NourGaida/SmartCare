from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL


def serialize_event(event, boot_id):
    payload = {
        "schemaVersion": 1,
        "eventId": str(
            uuid5(
                NAMESPACE_URL,
                f"smartcare:event:{event.device_id}:"
                f"{boot_id}:{event.sequence}:{event.event_type}",
            )
        ),
        "deviceId": event.device_id,
        "bootId": boot_id,
        "sequence": event.sequence,
        "eventType": event.event_type,
        "anomalyType": event.anomaly_type,
        "detectedAtUtc": datetime.now(timezone.utc).isoformat(),
        "source": "smartcare-detector",
    }
    if event.started_sequence is not None:
        payload["startedSequence"] = event.started_sequence
    return payload
