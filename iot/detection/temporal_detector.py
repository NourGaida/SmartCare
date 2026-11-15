from dataclasses import dataclass
from detector import SmartCareDetector


@dataclass
class TemporalResult:
    device_id: str
    sequence: int
    status: str
    anomaly_type: str | None
    consecutive_count: int
    missing_count: int = 0


class TemporalDetector:
    def __init__(self, required_consecutive=3):
        if required_consecutive < 1:
            raise ValueError("required_consecutive must be positive")

        self.detector = SmartCareDetector()
        self.required_consecutive = required_consecutive
        self.state = {}

    def detect(self, measurement):
        device_id = measurement["deviceId"]
        boot_id = measurement["bootId"]
        sequence = measurement["sequence"]

        if not isinstance(device_id, str) or not device_id.strip():
            raise ValueError("Invalid deviceId")
        if not isinstance(boot_id, str) or not boot_id.strip():
            raise ValueError("Invalid bootId")
        if type(sequence) is not int or sequence < 1:
            raise ValueError("Invalid sequence")

        current = self.state.get(device_id)

        if current is None or current["boot_id"] != boot_id:
            current = {
                "boot_id": boot_id,
                "last_sequence": 0,
                "type": None,
                "count": 0,
            }
            self.state[device_id] = current

        last_sequence = current["last_sequence"]

        if sequence <= last_sequence:
            status = (
                "DUPLICATE"
                if sequence == last_sequence
                else "OUT_OF_ORDER"
            )
            return TemporalResult(
                device_id, sequence, status, None,
                current["count"], 0,
            )

        missing_count = max(0, sequence - last_sequence - 1)

        if missing_count:
            current["type"] = None
            current["count"] = 0

        result = self.detector.detect(measurement)

        if result.status == "ANOMALY":
            if current["type"] == result.anomaly_type:
                current["count"] += 1
            else:
                current["type"] = result.anomaly_type
                current["count"] = 1

            status = (
                "SUSTAINED_ANOMALY"
                if current["count"] >= self.required_consecutive
                else "ANOMALY"
            )
        else:
            current["type"] = None
            current["count"] = 0
            status = result.status

        current["last_sequence"] = sequence

        return TemporalResult(
            device_id,
            sequence,
            status,
            result.anomaly_type,
            current["count"],
            missing_count,
        )
