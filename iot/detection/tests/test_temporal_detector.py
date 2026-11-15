import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from temporal_detector import TemporalDetector


def measurement(sequence, hr=75, spo2=98, device="sc-001",
                quality="good", reason=None):
    return {
        "deviceId": device,
        "bootId": "boot-001",
        "sequence": sequence,
        "heartRate": hr,
        "spo2": spo2,
        "quality": quality,
        "reason": reason,
    }


def test_single_anomaly():
    detector = TemporalDetector(required_consecutive=3)

    result = detector.detect(measurement(1, hr=140))

    assert result.status == "ANOMALY"
    assert result.consecutive_count == 1


def test_sustained_anomaly():
    detector = TemporalDetector(required_consecutive=3)

    first = detector.detect(measurement(1, hr=140))
    second = detector.detect(measurement(2, hr=145))
    third = detector.detect(measurement(3, hr=142))

    assert first.status == "ANOMALY"
    assert second.status == "ANOMALY"
    assert third.status == "SUSTAINED_ANOMALY"
    assert third.consecutive_count == 3


def test_return_to_normal():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))
    detector.detect(measurement(2, hr=145))

    normal = detector.detect(measurement(3, hr=75))
    new_anomaly = detector.detect(measurement(4, hr=150))

    assert normal.status == "NORMAL"
    assert normal.consecutive_count == 0
    assert new_anomaly.consecutive_count == 1


def test_invalid_signal_resets_counter():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))

    invalid = detector.detect(
        measurement(
            2,
            hr=None,
            spo2=None,
            quality="invalid",
            reason="no_finger",
        )
    )

    next_result = detector.detect(measurement(3, hr=145))

    assert invalid.status == "INVALID"
    assert invalid.consecutive_count == 0
    assert next_result.consecutive_count == 1


def test_independent_devices():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140, device="sc-001"))
    detector.detect(measurement(2, hr=145, device="sc-001"))

    other = detector.detect(
        measurement(1, hr=150, device="sc-002")
    )

    assert other.status == "ANOMALY"
    assert other.consecutive_count == 1

    result = detector.detect(
        measurement(3, hr=142, device="sc-001")
    )

    assert result.status == "SUSTAINED_ANOMALY"



def test_duplicate():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))
    duplicate = detector.detect(measurement(1, hr=140))
    next_result = detector.detect(measurement(2, hr=145))

    assert duplicate.status == "DUPLICATE"
    assert duplicate.consecutive_count == 1
    assert next_result.consecutive_count == 2
    assert next_result.status == "ANOMALY"


def test_out_of_order():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))
    detector.detect(measurement(2, hr=145))

    old = detector.detect(measurement(1, hr=140))
    next_result = detector.detect(measurement(3, hr=142))

    assert old.status == "OUT_OF_ORDER"
    assert next_result.status == "SUSTAINED_ANOMALY"


def test_missing_sequence():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))
    detector.detect(measurement(2, hr=145))

    result = detector.detect(measurement(5, hr=142))

    assert result.missing_count == 2
    assert result.consecutive_count == 1
    assert result.status == "ANOMALY"


def test_new_boot():
    detector = TemporalDetector(required_consecutive=3)

    detector.detect(measurement(1, hr=140))
    detector.detect(measurement(2, hr=145))

    restarted = measurement(1, hr=150)
    restarted["bootId"] = "boot-002"

    result = detector.detect(restarted)

    assert result.status == "ANOMALY"
    assert result.consecutive_count == 1
