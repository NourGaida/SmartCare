
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SPLIT_DIR = ROOT / "data/processed/bidmc/splits"
FEATURE_DIR = ROOT / "data/processed/bidmc/features"

WINDOW_SIZE = 5

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


def extract_features(df):
    rows = []

    for recording_id, group in df.groupby("recordingId"):
        group = group.sort_values("timestampSeconds")

        # Do not create windows across missing timestamps.
        segment_id = (
            group["timestampSeconds"].diff().ne(1)
        ).cumsum()

        for _, segment in group.groupby(segment_id):
            hr = segment["heartRate"].to_numpy()
            spo2 = segment["spo2"].to_numpy()
            times = segment["timestampSeconds"].to_numpy()

            for i in range(WINDOW_SIZE - 1, len(segment)):
                h = hr[i - WINDOW_SIZE + 1:i + 1]
                s = spo2[i - WINDOW_SIZE + 1:i + 1]

                rows.append({
                    "recordingId": recording_id,
                    "timestampSeconds": times[i],
                    "hr_mean": float(np.mean(h)),
                    "hr_std": float(np.std(h)),
                    "hr_min": float(np.min(h)),
                    "hr_max": float(np.max(h)),
                    "hr_delta": float(h[-1] - h[0]),
                    "spo2_mean": float(np.mean(s)),
                    "spo2_std": float(np.std(s)),
                    "spo2_min": float(np.min(s)),
                    "spo2_max": float(np.max(s)),
                    "spo2_delta": float(s[-1] - s[0]),
                })

    return pd.DataFrame(rows)


def main():
    FEATURE_DIR.mkdir(parents=True, exist_ok=True)

    for split in ["train", "val", "test"]:
        df = pd.read_csv(SPLIT_DIR / f"{split}.csv")

        features = extract_features(df)

        output = FEATURE_DIR / f"{split}_features.csv"
        features.to_csv(output, index=False)

        print(
            f"{split}: {len(features)} windows "
            f"saved to {output}"
        )


if __name__ == "__main__":
    main()
