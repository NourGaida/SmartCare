
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]

FEATURE_DIR = ROOT / "data/processed/bidmc/features"
MODEL_DIR = ROOT / "models/bidmc"
REPORT_DIR = ROOT / "reports/bidmc"

SEED = 42

FEATURE_COLUMNS = [
    "hr_mean",
    "hr_std",
    "hr_min",
    "hr_max",
    "hr_delta",
    "spo2_mean",
    "spo2_std",
    "spo2_min",
    "spo2_max",
    "spo2_delta",
]


def load_split(name):
    path = FEATURE_DIR / f"{name}_features.csv"
    df = pd.read_csv(path)

    required = set(FEATURE_COLUMNS) | {
        "recordingId",
        "timestampSeconds",
    }

    if not required.issubset(df.columns):
        raise ValueError(f"Missing columns in {path}")

    if df[FEATURE_COLUMNS].isna().any().any():
        raise ValueError(f"Missing feature values in {name}")

    return df


def evaluate_split(df, scores, threshold):
    flagged = scores >= threshold

    per_recording = (
        pd.DataFrame({
            "recordingId": df["recordingId"].to_numpy(),
            "flagged": flagged,
        })
        .groupby("recordingId")["flagged"]
        .agg(["mean", "sum", "count"])
    )

    return {
        "windows": int(len(scores)),
        "recordings": int(df["recordingId"].nunique()),
        "flagged_windows": int(flagged.sum()),
        "flagged_fraction": float(flagged.mean()),
        "score_mean": float(np.mean(scores)),
        "score_median": float(np.median(scores)),
        "score_p95": float(np.quantile(scores, 0.95)),
        "score_p99": float(np.quantile(scores, 0.99)),
        "recording_flagged_fraction_mean": float(
            per_recording["mean"].mean()
        ),
        "recording_flagged_fraction_max": float(
            per_recording["mean"].max()
        ),
    }


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train = load_split("train")
    val = load_split("val")
    test = load_split("test")

    # Verify recording-level isolation.
    train_ids = set(train["recordingId"])
    val_ids = set(val["recordingId"])
    test_ids = set(test["recordingId"])

    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)

    X_train = train[FEATURE_COLUMNS]
    X_val = val[FEATURE_COLUMNS]
    X_test = test[FEATURE_COLUMNS]

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("model", IsolationForest(
            n_estimators=200,
            max_samples="auto",
            contamination="auto",
            random_state=SEED,
            n_jobs=-1,
        )),
    ])

    print("Training Isolation Forest...")
    pipeline.fit(X_train)

    # Higher score = more anomalous.
    train_scores = -pipeline.decision_function(X_train)
    val_scores = -pipeline.decision_function(X_val)
    test_scores = -pipeline.decision_function(X_test)

    # Exploratory threshold: top 5% of validation scores.
    # This is NOT a clinically calibrated threshold.
    threshold = float(np.quantile(val_scores, 0.95))

    results = {
        "dataset": "BIDMC",
        "model": "IsolationForest",
        "seed": SEED,
        "feature_columns": FEATURE_COLUMNS,
        "window_size_seconds": 5,
        "threshold": threshold,
        "threshold_method": "validation_score_p95",
        "threshold_is_clinically_validated": False,
        "train": evaluate_split(
            train, train_scores, threshold
        ),
        "validation": evaluate_split(
            val, val_scores, threshold
        ),
        "test": evaluate_split(
            test, test_scores, threshold
        ),
    }

    model_path = MODEL_DIR / "isolation_forest_bidmc.joblib"
    joblib.dump({
        "pipeline": pipeline,
        "features": FEATURE_COLUMNS,
        "threshold": threshold,
        "window_size": 5,
        "dataset": "BIDMC",
    }, model_path)

    report_path = REPORT_DIR / "evaluation_real.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    for name, scores, df in [
        ("train", train_scores, train),
        ("val", val_scores, val),
        ("test", test_scores, test),
    ]:
        output = df[[
            "recordingId",
            "timestampSeconds",
        ]].copy()

        output["anomalyScore"] = scores
        output["flagged"] = scores >= threshold

        output.to_csv(
            REPORT_DIR / f"{name}_scores.csv",
            index=False,
        )

    print("\n=== RESULTS ===")
    print(json.dumps(results, indent=2))

    print(f"\nModel saved: {model_path}")
    print(f"Report saved: {report_path}")


if __name__ == "__main__":
    main()
