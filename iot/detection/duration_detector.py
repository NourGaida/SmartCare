from dataclasses import dataclass
from datetime import datetime, timezone

from temporal_detector import TemporalDetector


@dataclass
class DurationResult:
    device_id: str
    sequence: int
    status: str
    anomaly_type: str | None
    consecutive_count: int
    duration_seconds: float
    episode_interrupted: bool = False


class DurationDetector:
    def __init__(
        self,
        required_consecutive=3,
        required_duration_seconds=10,
        max_gap_seconds=3,
    ):
        if required_duration_seconds <= 0:
            raise ValueError("Duration must be positive")
        if max_gap_seconds <= 0:
            raise ValueError("Maximum gap must be positive")

        self.temporal = TemporalDetector(required_consecutive)
        self.required_duration = required_duration_seconds
        self.max_gap = max_gap_seconds
        self.start_times = {}
        self.last_times = {}
        self.seen_boots = {}

    def detect(self, measurement):
        device_id = measurement["deviceId"]
        boot_id = measurement["bootId"]
        sequence = measurement["sequence"]

        raw_timestamp = measurement["acquiredAtUtc"]

        if not isinstance(raw_timestamp, str):
            raise ValueError("Invalid timestamp")

        try:
            timestamp = datetime.fromisoformat(
                raw_timestamp.replace("Z", "+00:00")
            )
        except ValueError as exc:
            raise ValueError("Invalid timestamp") from exc

        if timestamp.tzinfo is None:
            raise ValueError("Timestamp must include timezone")

        timestamp = timestamp.astimezone(timezone.utc)
        key = (device_id, boot_id)

        # Reject a previously observed boot that is no longer active.
        current = self.temporal.state.get(device_id)
        seen = self.seen_boots.setdefault(device_id, set())

        if (
            current is not None
            and current["boot_id"] != boot_id
            and boot_id in seen
        ):
            return DurationResult(
                device_id, sequence, "STALE_BOOT",
                None, 0, 0.0,
            )

        last = self.last_times.get(key)

        if last is not None and timestamp < last:
            return DurationResult(
                device_id, sequence, "OUT_OF_ORDER",
                None, 0, 0.0,
            )

        # Evaluate sequence validity before modifying episode state.
        current = self.temporal.state.get(device_id)

        if (
            current is not None
            and current["boot_id"] == boot_id
            and sequence <= current["last_sequence"]
        ):
            status = (
                "DUPLICATE"
                if sequence == current["last_sequence"]
                else "OUT_OF_ORDER"
            )
            return DurationResult(
                device_id,
                sequence,
                status,
                None,
                current["count"],
                0.0,
            )

        gap_detected = (
            last is not None
            and (timestamp - last).total_seconds() > self.max_gap
        )

        if gap_detected:
            self.start_times.pop(key, None)

            if (
                current is not None
                and current["boot_id"] == boot_id
            ):
                current["type"] = None
                current["count"] = 0

        result = self.temporal.detect(measurement)

        episode_interrupted = (
            gap_detected or result.missing_count > 0
        )

        seen.add(boot_id)
        self.last_times[key] = timestamp

        if result.missing_count or result.status in ("NORMAL", "INVALID"):
            self.start_times.pop(key, None)

        if result.status not in ("ANOMALY", "SUSTAINED_ANOMALY"):
            return DurationResult(
                device_id,
                sequence,
                result.status,
                result.anomaly_type,
                result.consecutive_count,
                0.0,
                episode_interrupted=episode_interrupted,
            )

        episode = self.start_times.get(key)

        if episode is None or episode[0] != result.anomaly_type:
            self.start_times[key] = (
                result.anomaly_type,
                timestamp,
            )
            start = timestamp
        else:
            start = episode[1]

        duration = (timestamp - start).total_seconds()

        status = (
            "SUSTAINED_ANOMALY"
            if (
                result.consecutive_count
                >= self.temporal.required_consecutive
                and duration >= self.required_duration
            )
            else "ANOMALY"
        )

        return DurationResult(
            device_id,
            sequence,
            status,
            result.anomaly_type,
            result.consecutive_count,
            duration,
            episode_interrupted=episode_interrupted,
        )
