import json
import os
import pickle
from platform import platform, processor
from time import perf_counter

import joblib
import numpy as np
import pandas as pd
import pytest
import sklearn.base
from fastapi.testclient import TestClient
from sklearn.exceptions import InconsistentVersionWarning
from sklearn.preprocessing import StandardScaler

from iot.mlops.api import main
from iot.mlops.src import features_real


# Scope Statement §5.5.4, release gate for inference on the recorded CPU.
MAX_P95_INFERENCE_MS = 500


def assert_latency_gate(samples_ms):
    p95 = float(np.percentile(samples_ms, 95))
    assert p95 <= MAX_P95_INFERENCE_MS, f"p95 {p95:.2f} ms exceeds {MAX_P95_INFERENCE_MS} ms"
    return p95


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as client:
        yield client


@pytest.fixture
def prediction():
    return {
        "deviceId": "sc-ml-validation",
        "measurements": [
            {"timestampSeconds": i, "heartRate": 73 + i, "spo2": 98 - i % 2}
            for i in range(main.window_size)
        ],
    }


def test_compatible_bidmc_artifact_serves_repeatable_shadow_predictions(client, prediction):
    assert client.get("/health").json() == {"status": "ok", "modelLoaded": True}
    info = client.get("/model-info").json()
    assert info["dataset"] == "BIDMC"
    assert info["windowSize"] == features_real.WINDOW_SIZE
    assert info["features"] == features_real.FEATURE_COLUMNS
    assert info["mode"] == "shadow"
    assert info["clinicalValidation"] is False

    response = client.post("/predict", json=prediction)
    assert response.status_code == 200
    result = response.json()
    assert result == client.post("/predict", json=prediction).json()
    assert result["deviceId"] == prediction["deviceId"]
    assert np.isfinite(result["anomalyScore"])
    assert result["threshold"] == info["threshold"]
    assert result["flagged"] == (result["anomalyScore"] >= info["threshold"])
    assert result["clinicalAlert"] is False


@pytest.mark.parametrize("p95", [100, MAX_P95_INFERENCE_MS])
def test_latency_gate_accepts_a_compatible_candidate_within_budget(p95):
    assert assert_latency_gate([p95] * 20) == p95


def test_latency_gate_rejects_below_target_performance_even_with_fast_median():
    # Repeatable durations for a candidate with a slow inference tail.
    durations = [10] * 90 + [MAX_P95_INFERENCE_MS + 1] * 10
    with pytest.raises(AssertionError, match="exceeds"):
        assert_latency_gate(durations)


@pytest.mark.skipif(os.getenv("SMARTCARE_MEASURE_INFERENCE") != "1", reason="Opt in to timing on a recorded CPU")
def test_local_inference_latency(client, prediction):
    warmup = client.post("/predict", json=prediction)
    assert warmup.status_code == 200
    samples = []
    for _ in range(100):
        started = perf_counter()
        response = client.post("/predict", json=prediction)
        samples.append((perf_counter() - started) * 1000)
        assert response.status_code == 200
    p95 = assert_latency_gate(samples)
    print(f"In-process /predict, n={len(samples)}, p95={p95:.2f} ms, {platform()}, {processor()}")


def test_incompatible_serialized_sklearn_version_is_rejected(tmp_path, monkeypatch):
    path = tmp_path / "incompatible.joblib"
    # Serialize a tiny local estimator with the same version marker used by the BIDMC bundle.
    estimator = StandardScaler().fit([[0], [1]])
    with monkeypatch.context() as patch:
        patch.setattr(sklearn.base, "__version__", "0.0.0")
        joblib.dump({"pipeline": estimator}, path)
    with pytest.raises(InconsistentVersionWarning) as error:
        main.load_model(path)
    assert error.value.original_sklearn_version == "0.0.0"


def test_a_truncated_model_file_is_rejected(tmp_path):
    path = tmp_path / "truncated.joblib"
    path.write_bytes(b"\x80\x04")
    with pytest.raises((EOFError, pickle.UnpicklingError)):
        main.load_model(path)


@pytest.mark.parametrize("sample_field", [None, "timestampSeconds", "heartRate", "spo2"])
def test_required_measurement_fields(client, prediction, sample_field):
    if sample_field is None:
        del prediction["measurements"]
        expected = ["body", "measurements"]
    else:
        del prediction["measurements"][0][sample_field]
        expected = ["body", "measurements", 0, sample_field]
    response = client.post("/predict", json=prediction)
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == expected


@pytest.mark.parametrize("device", [None, ""], ids=["missing", "empty"])
def test_device_id_is_required_and_non_empty(client, prediction, device):
    if device is None:
        del prediction["deviceId"]
    else:
        prediction["deviceId"] = device
    assert client.post("/predict", json=prediction).status_code == 422


@pytest.mark.parametrize(("field", "value"), [
    ("timestampSeconds", -1), ("timestampSeconds", 1.5),
    ("heartRate", 29), ("heartRate", 221), ("heartRate", None), ("heartRate", "NaN"),
    ("spo2", 49), ("spo2", 101), ("spo2", None), ("spo2", "not-a-number"),
])
def test_invalid_measurement_values(client, prediction, field, value):
    prediction["measurements"][0][field] = value
    response = client.post("/predict", json=prediction)
    assert response.status_code == 422
    assert "anomalyScore" not in response.json()


@pytest.mark.parametrize("kind", ["short", "long", "gap", "duplicate", "out-of-order"])
def test_window_size_and_consecutive_timestamps(client, prediction, kind):
    rows = prediction["measurements"]
    if kind == "short":
        rows.pop()
    elif kind == "long":
        rows.append({**rows[-1], "timestampSeconds": rows[-1]["timestampSeconds"] + 1})
    elif kind == "gap":
        rows[-1]["timestampSeconds"] += 1
    elif kind == "duplicate":
        rows[-1]["timestampSeconds"] = rows[-2]["timestampSeconds"]
    else:
        rows[-1], rows[-2] = rows[-2], rows[-1]
    assert client.post("/predict", json=prediction).status_code == 422


def test_bidmc_threshold_matches_the_recorded_validation_scores():
    reports = main.MODEL_PATH.parents[2] / "reports" / "bidmc"
    evaluation = json.loads((reports / "evaluation_real.json").read_text(encoding="utf-8"))
    scores = pd.read_csv(reports / "val_scores.csv")["anomalyScore"]
    assert evaluation["threshold_method"] == "validation_score_p95"
    assert len(scores) == evaluation["validation"]["windows"]
    assert main.threshold == pytest.approx(np.percentile(scores, 95), abs=1e-12)
    assert main.threshold == evaluation["threshold"]


def test_offline_online_parity_for_ordered_features_and_scores(client, prediction):
    rows = prediction["measurements"]
    offline = features_real.extract_features(pd.DataFrame(rows).assign(recordingId="test-record"))
    feature_names = features_real.FEATURE_COLUMNS
    assert list(offline.columns[2:]) == main.features == feature_names
    validated = main.PredictionRequest.model_validate(prediction)
    online = main.extract_features(validated.measurements)
    assert list(online) == feature_names
    assert online == pytest.approx(offline[feature_names].iloc[0].to_dict())
    score = float(-main.pipeline.decision_function(offline[feature_names])[0])
    result = client.post("/predict", json=prediction).json()
    assert result["anomalyScore"] == pytest.approx(score)
    assert result["flagged"] == (score >= main.threshold)


def test_offline_online_parity_rejects_windows_that_cross_gaps(client, prediction):
    rows = prediction["measurements"]
    rows[-1]["timestampSeconds"] += 1
    assert features_real.extract_features(pd.DataFrame(rows).assign(recordingId="test-record")).empty
    assert client.post("/predict", json=prediction).status_code == 422
