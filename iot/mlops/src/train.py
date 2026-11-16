import mlflow
import mlflow.sklearn
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    average_precision_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURE_COLUMNS


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "processed"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"

RANDOM_STATE = 42


def load_split(name):
    df = pd.read_csv(DATA_DIR / f"{name}.csv")
    if df[FEATURE_COLUMNS].isna().any().any():
        raise ValueError(f"Missing feature values in {name}")
    return df


def evaluate(y_true, scores, threshold):
    predictions = (scores >= threshold).astype(int)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true,
        predictions,
        average="binary",
        zero_division=0,
    )

    return {
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "average_precision": float(
            average_precision_score(y_true, scores)
        ),
        "false_positives": int(
            ((predictions == 1) & (y_true == 0)).sum()
        ),
        "false_negatives": int(
            ((predictions == 0) & (y_true == 1)).sum()
        ),
    }


def main():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    train = load_split("train")
    val = load_split("val")
    test = load_split("test")

    # Unsupervised baseline: fit only on normal windows.
    normal_train = train[train["label"] == 0]

    X_train = normal_train[FEATURE_COLUMNS]
    X_val = val[FEATURE_COLUMNS]
    X_test = test[FEATURE_COLUMNS]

    y_val = val["label"].to_numpy()
    y_test = test["label"].to_numpy()

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("isolation_forest", IsolationForest(
            n_estimators=200,
            max_samples="auto",
            contamination="auto",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )),
    ])

    model.fit(X_train)

    # Higher scores mean more anomalous.
    val_scores = -model.decision_function(X_val)

    # Choose the threshold using validation only.
    thresholds = np.unique(
        np.quantile(val_scores, np.linspace(0, 1, 201))
    )

    best_threshold = None
    best_f1 = -1

    for threshold in thresholds:
        predictions = (val_scores >= threshold).astype(int)
        _, _, f1, _ = precision_recall_fscore_support(
            y_val,
            predictions,
            average="binary",
            zero_division=0,
        )

        if f1 > best_f1:
            best_f1 = f1
            best_threshold = float(threshold)

    test_scores = -model.decision_function(X_test)

    metrics = {
        "validation": evaluate(
            y_val, val_scores, best_threshold
        ),
        "test": evaluate(
            y_test, test_scores, best_threshold
        ),
        "threshold": best_threshold,
        "train_normal_windows": len(normal_train),
        "features": FEATURE_COLUMNS,
    }
    mlflow.set_tracking_uri("http://127.0.0.1:5000")
    mlflow.set_experiment("SmartCare-Anomaly-Detection")

    with mlflow.start_run(run_name="IsolationForest-baseline-v1"):

        mlflow.log_params({
            "model_type": "IsolationForest",
            "n_estimators": 200,
            "contamination": "auto",
            "window_size": 5,
            "random_state": RANDOM_STATE,
            "train_normal_windows": len(normal_train),
            "threshold": best_threshold,
        })

        for split in ("validation", "test"):
            for metric_name, value in metrics[split].items():
                mlflow.log_metric(
                    f"{split}_{metric_name}",
                    value,
                )

        mlflow.sklearn.log_model(
             sk_model=model,
             name="isolation_forest",
             skops_trusted_types=["sklearn.tree._tree.Tree"],
        )
    
    joblib.dump(
        {
            "model": model,
            "threshold": best_threshold,
            "features": FEATURE_COLUMNS,
        },
        MODEL_DIR / "isolation_forest.joblib",
    )

    with open(
        REPORT_DIR / "evaluation.json",
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()