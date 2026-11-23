
from pathlib import Path
import json
import joblib
import mlflow

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports/bidmc"
MODEL_DIR = ROOT / "models/bidmc"

REPORT_PATH = REPORT_DIR / "evaluation_real.json"
MODEL_PATH = MODEL_DIR / "isolation_forest_bidmc.joblib"

# Local MLflow tracking
TRACKING_DB = (ROOT / "mlflow.db").as_posix()
mlflow.set_tracking_uri(f"sqlite:///{TRACKING_DB}")

mlflow.set_experiment("SmartCare_BIDMC_IsolationForest")

with open(REPORT_PATH, encoding="utf-8") as f:
    results = json.load(f)

artifact = joblib.load(MODEL_PATH)
pipeline = artifact["pipeline"]
model = pipeline.named_steps["model"]

with mlflow.start_run(run_name="bidmc_iforest_v1"):
    mlflow.log_params({
        "dataset": "BIDMC",
        "model_type": "IsolationForest",
        "window_size": artifact["window_size"],
        "n_estimators": model.n_estimators,
        "contamination": str(model.contamination),
        "random_state": model.random_state,
        "threshold_method": results["threshold_method"],
        "feature_count": len(artifact["features"]),
    })

    mlflow.log_metric(
        "anomaly_threshold",
        results["threshold"]
    )

    for split in ["train", "validation", "test"]:
        data = results[split]

        mlflow.log_metrics({
            f"{split}_flagged_fraction":
                data["flagged_fraction"],
            f"{split}_score_mean":
                data["score_mean"],
            f"{split}_score_p95":
                data["score_p95"],
            f"{split}_score_p99":
                data["score_p99"],
            f"{split}_recording_flagged_fraction_max":
                data["recording_flagged_fraction_max"],
        })

    # Log model bundle and evaluation reports
    mlflow.log_artifact(
        str(MODEL_PATH),
        artifact_path="model_bundle"
    )

    mlflow.log_artifacts(
        str(REPORT_DIR),
        artifact_path="evaluation"
    )

    mlflow.set_tags({
        "project": "SmartCare",
        "dataset_type": "real_physiological_data",
        "clinical_validation": "not_validated",
        "deployment_mode": "shadow_only",
    })

    print("MLflow experiment logged successfully")
    print("Run ID:", mlflow.active_run().info.run_id)
