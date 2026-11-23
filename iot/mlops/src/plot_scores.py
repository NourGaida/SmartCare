
from pathlib import Path
import json
import pandas as pd
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports/bidmc"

with open(REPORT_DIR / "evaluation_real.json") as f:
    report = json.load(f)

threshold = report["threshold"]

plt.figure(figsize=(10, 5))

for split in ["train", "val", "test"]:
    df = pd.read_csv(
        REPORT_DIR / f"{split}_scores.csv"
    )

    plt.hist(
        df["anomalyScore"],
        bins=60,
        density=True,
        alpha=0.35,
        label=split
    )

plt.axvline(
    threshold,
    color="red",
    linestyle="--",
    label=f"Threshold = {threshold:.4f}"
)

plt.xlabel("Anomaly score (higher = more anomalous)")
plt.ylabel("Density")
plt.title("BIDMC Isolation Forest — Score distributions")
plt.legend()
plt.tight_layout()

plt.savefig(
    REPORT_DIR / "score_distributions.png",
    dpi=160
)

plt.show()
