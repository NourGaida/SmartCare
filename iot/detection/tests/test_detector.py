import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from detector import SmartCareDetector


def make_measurement(hr=75, spo2=98, quality="good", reason=None):
    return {
        "deviceId": "sc-001",
        "sequence": 1,
        "heartRate": hr,
        "spo2": spo2,
        "quality": quality,
        "reason": reason,
    }


def test_normal():
    result = SmartCareDetector().detect(make_measurement())
    assert result.status == "NORMAL"
    assert result.anomaly_type is None


def test_spike():
    result = SmartCareDetector().detect(make_measurement(hr=180))
    assert result.status == "ANOMALY"
    assert result.anomaly_type == "HIGH_HEART_RATE"


def test_low_spo2():
    result = SmartCareDetector().detect(
        make_measurement(hr=125, spo2=93)
    )
    assert result.status == "ANOMALY"
    assert result.anomaly_type == "LOW_SPO2"


def test_invalid_signal():
    result = SmartCareDetector().detect(
        make_measurement(
            hr=None,
            spo2=None,
            quality="invalid",
            reason="no_finger",
        )
    )
    assert result.status == "INVALID"
    assert result.anomaly_type == "SIGNAL_QUALITY"
