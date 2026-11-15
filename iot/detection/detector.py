from dataclasses import dataclass
from typing import Optional


@dataclass
class DetectionResult:
    device_id: str
    sequence: int
    status: str
    anomaly_type: Optional[str]
    reason: str


class SmartCareDetector:
    def __init__(
        self,
        hr_min: int = 50,
        hr_max: int = 120,
        spo2_min: int = 94,
    ):
        self.hr_min = hr_min
        self.hr_max = hr_max
        self.spo2_min = spo2_min

    def detect(self, measurement: dict) -> DetectionResult:
        device_id = measurement["deviceId"]
        sequence = measurement["sequence"]
        quality = measurement["quality"]

        if quality == "invalid":
            return DetectionResult(
                device_id,
                sequence,
                "INVALID",
                "SIGNAL_QUALITY",
                measurement.get("reason") or "Invalid signal",
            )

        if quality != "good":
            raise ValueError("Unsupported measurement quality")

        hr = measurement["heartRate"]
        spo2 = measurement["spo2"]

        if (
            type(hr) is not int
            or type(spo2) is not int
            or not 1 <= hr <= 300
            or not 0 <= spo2 <= 100
        ):
            raise ValueError("Invalid physiological values")

        if spo2 < self.spo2_min:
            return DetectionResult(
                device_id,
                sequence,
                "ANOMALY",
                "LOW_SPO2",
                f"SpO2 below threshold: {spo2}%",
            )

        if hr > self.hr_max:
            return DetectionResult(
                device_id,
                sequence,
                "ANOMALY",
                "HIGH_HEART_RATE",
                f"Heart rate above threshold: {hr} bpm",
            )

        if hr < self.hr_min:
            return DetectionResult(
                device_id,
                sequence,
                "ANOMALY",
                "LOW_HEART_RATE",
                f"Heart rate below threshold: {hr} bpm",
            )

        return DetectionResult(
            device_id,
            sequence,
            "NORMAL",
            None,
            "Physiological values within configured thresholds",
        )
