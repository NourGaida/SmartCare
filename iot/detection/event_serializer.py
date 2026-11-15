from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL


def serialize_event(event, boot_id):
    return {
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
