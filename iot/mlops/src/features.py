
import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "hr_mean",
    "hr_std",
    "hr_min",
    "hr_max",
    "spo2_mean",
    "spo2_std",
    "spo2_min",
    "spo2_max",
    "hr_delta",
    "spo2_delta",
]


def build_features(df, window_size=5):
    if window_size < 2:
        raise ValueError("window_size must be >= 2")

    records = []

    for session_id, group in df.groupby("sessionId", sort=True):
        group = group.sort_values(
            ["acquiredAtUtc", "sequence"], kind="stable"
        )

        # Duplicate MQTT messages are not independent observations.
        group = group.drop_duplicates(
            subset=["bootId", "sequence"], keep="first"
        )

        # Keep only valid physiological readings for this baseline.
        group = group[
            (group["quality"].str.lower() == "good")
            & group["heartRate"].notna()
            & group["spo2"].notna()
        ]

        for end in range(window_size, len(group) + 1):
            window = group.iloc[end-window_size:end]

            hr = window["heartRate"].to_numpy(dtype=float)
            spo2 = window["spo2"].to_numpy(dtype=float)

            record = {
                "sessionId": session_id,
                "scenario": window["scenario"].iloc[-1],
                "windowEndSequence": int(window["sequence"].iloc[-1]),
                "label": int(window["label"].max()),
                "hr_mean": float(hr.mean()),
                "hr_std": float(hr.std()),
                "hr_min": float(hr.min()),
                "hr_max": float(hr.max()),
                "spo2_mean": float(spo2.mean()),
                "spo2_std": float(spo2.std()),
                "spo2_min": float(spo2.min()),
                "spo2_max": float(spo2.max()),
                "hr_delta": float(hr[-1] - hr[0]),
                "spo2_delta": float(spo2[-1] - spo2[0]),
            }

            records.append(record)

    return pd.DataFrame(records)
