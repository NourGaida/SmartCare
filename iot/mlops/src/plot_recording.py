
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data/processed/bidmc/bidmc_combined.csv"
REPORT = ROOT / "reports/bidmc"

recording_id = "bidmc_32"

df = pd.read_csv(DATA)
signal = df[df["recordingId"] == recording_id].copy()

scores = pd.read_csv(REPORT / "train_scores.csv")
scores = scores[
    scores["recordingId"] == recording_id
].copy()

fig, axes = plt.subplots(
    3, 1, figsize=(12, 9), sharex=True
)

axes[0].plot(
    signal["timestampSeconds"],
    signal["heartRate"]
)
axes[0].set_ylabel("Pulse (bpm)")
axes[0].set_title(f"BIDMC — {recording_id}")

axes[1].plot(
    signal["timestampSeconds"],
    signal["spo2"]
)
axes[1].set_ylabel("SpO2 (%)")

axes[2].plot(
    scores["timestampSeconds"],
    scores["anomalyScore"],
    label="Anomaly score"
)

threshold = 0.020116262726020958

axes[2].axhline(
    threshold,
    color="red",
    linestyle="--",
    label="Threshold"
)

axes[2].set_ylabel("Anomaly score")
axes[2].set_xlabel("Time (seconds)")
axes[2].legend()

plt.tight_layout()

plt.savefig(
    REPORT / f"{recording_id}_signals.png",
    dpi=160
)

plt.show()
