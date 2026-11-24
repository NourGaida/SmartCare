from pathlib import Path
import warnings

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field, model_validator
from sklearn.exceptions import InconsistentVersionWarning

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "bidmc" / "isolation_forest_bidmc.joblib"

app = FastAPI(
    title="SmartCare ML Inference API",
    version="1.0.0",
    description="Experimental anomaly detection on physiological measurements",
)


def load_model(path):
    # Reject an artifact built against a different scikit-learn version.
    with warnings.catch_warnings():
        warnings.simplefilter("error", InconsistentVersionWarning)
        return joblib.load(path)


# Load the local trained model bundle once at startup.
bundle = load_model(MODEL_PATH)
pipeline = bundle["pipeline"]
features = bundle["features"]
threshold = float(bundle["threshold"])
window_size = int(bundle["window_size"])


class Measurement(BaseModel):
    timestampSeconds: int = Field(ge=0)
    heartRate: float = Field(ge=30, le=220)
    spo2: float = Field(ge=50, le=100)


class PredictionRequest(BaseModel):
    deviceId: str = Field(min_length=1)
    measurements: list[Measurement]

    @model_validator(mode="after")
    def validate_window(self):
        if len(self.measurements) != window_size:
            raise ValueError(
                f"Exactly {window_size} measurements are required"
            )

        times = [m.timestampSeconds for m in self.measurements]

        if any(b - a != 1 for a, b in zip(times, times[1:])):
            raise ValueError(
                "Measurements must be consecutive at 1-second intervals"
            )

        return self


def extract_features(measurements):
    hr = np.array([m.heartRate for m in measurements])
    spo2 = np.array([m.spo2 for m in measurements])

    return {
        "hr_mean": float(np.mean(hr)),
        "hr_std": float(np.std(hr)),
        "hr_min": float(np.min(hr)),
        "hr_max": float(np.max(hr)),
        "hr_delta": float(hr[-1] - hr[0]),
        "spo2_mean": float(np.mean(spo2)),
        "spo2_std": float(np.std(spo2)),
        "spo2_min": float(np.min(spo2)),
        "spo2_max": float(np.max(spo2)),
        "spo2_delta": float(spo2[-1] - spo2[0]),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "modelLoaded": True,
    }


@app.get("/model-info")
def model_info():
    return {
        "model": "IsolationForest",
        "dataset": bundle["dataset"],
        "windowSize": window_size,
        "features": features,
        "threshold": threshold,
        "mode": "shadow",
        "clinicalValidation": False,
    }


@app.post("/predict")
def predict(request: PredictionRequest):
    feature_values = extract_features(request.measurements)

    X = pd.DataFrame([feature_values], columns=features)

    score = float(-pipeline.decision_function(X)[0])
    flagged = bool(score >= threshold)

    return {
        "deviceId": request.deviceId,
        "model": "IsolationForest",
        "anomalyScore": score,
        "threshold": threshold,
        "flagged": flagged,
        "mode": "shadow",
        "clinicalAlert": False,
    }
