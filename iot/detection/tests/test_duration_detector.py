import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from duration_detector import DurationDetector


BASE_TIME = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


def measurement(sequence, seconds, hr=140, spo2=98):
    return {
        "deviceId": "sc-001",
        "bootId": "boot-001",
        "sequence": sequence,
        "acquiredAtUtc": (
            BASE_TIME + timedelta(seconds=seconds)
        ).isoformat(),
        "heartRate": hr,
        "spo2": spo2,
        "quality": "good",
        "reason": None,
    }


def test_short_anomaly():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    detector.detect(measurement(1, 0))
    detector.detect(measurement(2, 1))
    result = detector.detect(measurement(3, 2))

    assert result.status == "ANOMALY"
    assert result.duration_seconds == 2


def test_sustained_duration():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    for i in range(1, 11):
        detector.detect(measurement(i, i - 1))

    result = detector.detect(measurement(11, 10))

    assert result.status == "SUSTAINED_ANOMALY"
    assert result.duration_seconds == 10
    assert result.consecutive_count == 11


def test_return_to_normal_resets_duration():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    detector.detect(measurement(1, 0))
    detector.detect(measurement(2, 1))

    normal = detector.detect(
        measurement(3, 2, hr=75, spo2=98)
    )

    new_anomaly = detector.detect(measurement(4, 3))

    assert normal.status == "NORMAL"
    assert new_anomaly.status == "ANOMALY"
    assert new_anomaly.duration_seconds == 0


def test_duplicate_does_not_extend_duration():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    detector.detect(measurement(1, 0))

    duplicate = detector.detect(measurement(1, 0))
    result = detector.detect(measurement(2, 1))

    assert duplicate.status == "DUPLICATE"
    assert result.consecutive_count == 2
    assert result.duration_seconds == 1


def test_invalid_timestamp():
    detector = DurationDetector()

    invalid = measurement(1, 0)
    invalid["acquiredAtUtc"] = "not-a-date"

    with pytest.raises(ValueError, match="Invalid timestamp"):
        detector.detect(invalid)


def test_long_time_gap_does_not_confirm_sustained_anomaly():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    detector.detect(measurement(1, 0))
    detector.detect(measurement(2, 1))

    # Troisième mesure reçue 60 secondes plus tard.
    result = detector.detect(measurement(3, 61))

    assert result.status == "ANOMALY"
    assert result.consecutive_count == 1
    assert result.duration_seconds == 0


def test_old_boot_message_does_not_replace_current_state():
    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
    )

    first = measurement(1, 0)
    first["bootId"] = "boot-old"
    detector.detect(first)

    restarted = measurement(1, 5)
    restarted["bootId"] = "boot-new"
    detector.detect(restarted)

    late = measurement(2, 6)
    late["bootId"] = "boot-old"

    result = detector.detect(late)

    assert result.status == "STALE_BOOT"

    current = detector.temporal.state["sc-001"]
    assert current["boot_id"] == "boot-new"


def test_time_gap_sets_episode_interrupted():
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4

    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
        max_gap_seconds=3,
    )

    boot_id = str(uuid4())
    start = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)

    def measurement(sequence, timestamp):
        return {
            "deviceId": "sc-001",
            "bootId": boot_id,
            "sequence": sequence,
            "acquiredAtUtc": timestamp.isoformat(),
            "heartRate": 125,
            "spo2": 93,
            "quality": "good",
        }

    first = detector.detect(measurement(1, start))

    second = detector.detect(
        measurement(2, start + timedelta(seconds=1))
    )

    third = detector.detect(
        measurement(3, start + timedelta(seconds=11))
    )

    assert first.episode_interrupted is False
    assert second.episode_interrupted is False
    assert third.episode_interrupted is True

    assert third.status == "ANOMALY"
    assert third.consecutive_count == 1
    assert third.duration_seconds == 0.0


def test_missing_sequence_sets_episode_interrupted():
    from datetime import datetime, timedelta, timezone
    from uuid import uuid4

    detector = DurationDetector(
        required_consecutive=3,
        required_duration_seconds=10,
        max_gap_seconds=3,
    )

    boot_id = str(uuid4())
    start = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)

    def measurement(sequence, timestamp):
        return {
            "deviceId": "sc-001",
            "bootId": boot_id,
            "sequence": sequence,
            "acquiredAtUtc": timestamp.isoformat(),
            "heartRate": 125,
            "spo2": 93,
            "quality": "good",
        }

    first = detector.detect(measurement(1, start))

    second = detector.detect(
        measurement(2, start + timedelta(seconds=1))
    )

    # Sequence 3 is missing.
    fourth = detector.detect(
        measurement(4, start + timedelta(seconds=2))
    )

    assert first.episode_interrupted is False
    assert second.episode_interrupted is False
    assert fourth.episode_interrupted is True

    assert fourth.status == "ANOMALY"
    assert fourth.consecutive_count == 1
    assert fourth.duration_seconds == 0.0
