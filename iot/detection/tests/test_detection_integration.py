from datetime import datetime, timedelta, timezone

from duration_detector import DurationDetector
from event_manager import EventManager


def test_new_episode_after_time_interruption():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
        max_gap_seconds=3,
    )
    manager = EventManager()

    start = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    events = []

    def process(sequence, seconds, hr=125, spo2=93):
        measurement = {
            "deviceId": "sc-001",
            "bootId": "boot-integration-001",
            "sequence": sequence,
            "acquiredAtUtc": (
                start + timedelta(seconds=seconds)
            ).isoformat(),
            "heartRate": hr,
            "spo2": spo2,
            "quality": "good",
        }

        result = detector.detect(measurement)
        event = manager.process(result, measurement["bootId"])

        if event is not None:
            events.append((sequence, event.event_type))

        return result

    # First anomaly episode: 12 consecutive measurements.
    for seq in range(1, 13):
        process(seq, seq - 1)

    # 10-second interruption after sequence 12.
    interrupted = process(13, 21)

    assert interrupted.episode_interrupted is True
    assert interrupted.consecutive_count == 1
    assert interrupted.duration_seconds == 0.0

    # The new episode is not confirmed.
    process(14, 22, hr=75, spo2=98)

    assert events == [
        (1, "ANOMALY_STARTED"),
        (11, "SUSTAINED_ANOMALY_CONFIRMED"),
        (13, "ANOMALY_STARTED"),
    ]
