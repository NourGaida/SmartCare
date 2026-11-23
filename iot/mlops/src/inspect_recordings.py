
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data/processed/bidmc/bidmc_combined.csv"
REPORT = ROOT / "reports/bidmc"

df = pd.read_csv(DATA)

selected = [
    "bidmc_32",
    "bidmc_49",
    "bidmc_45",
    "bidmc_33",
    "bidmc_48",
    "bidmc_06",
]

rows = []

for rid in selected:
    group = df[df["recordingId"] == rid]

    rows.append({
        "recordingId": rid,
        "hr_mean": group["heartRate"].mean(),
        "hr_min": group["heartRate"].min(),
        "hr_max": group["heartRate"].max(),
        "hr_std": group["heartRate"].std(),
        "spo2_mean": group["spo2"].mean(),
        "spo2_min": group["spo2"].min(),
        "spo2_max": group["spo2"].max(),
        "spo2_std": group["spo2"].std(),
    })

summary = pd.DataFrame(rows)

print(summary.round(2).to_string(index=False))

REPORT.mkdir(parents=True, exist_ok=True)
summary.to_csv(
    REPORT / "physiological_comparison.csv",
    index=False
)
