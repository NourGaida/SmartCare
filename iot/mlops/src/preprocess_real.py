
from pathlib import Path
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "data/processed/bidmc/bidmc_combined.csv"
OUTPUT = ROOT / "data/processed/bidmc/splits"

SEED = 42

def main():
    df = pd.read_csv(INPUT)

    required = {
        "recordingId",
        "timestampSeconds",
        "heartRate",
        "spo2",
    }
    if not required.issubset(df.columns):
        raise ValueError("Missing required columns")

    # Keep recordings independent
    ids = sorted(df["recordingId"].unique())

    train_ids, temp_ids = train_test_split(
        ids,
        test_size=0.30,
        random_state=SEED,
    )

    val_ids, test_ids = train_test_split(
        temp_ids,
        test_size=0.50,
        random_state=SEED,
    )

    OUTPUT.mkdir(parents=True, exist_ok=True)

    splits = {
        "train": train_ids,
        "val": val_ids,
        "test": test_ids,
    }

    summary = {}

    for name, recording_ids in splits.items():
        subset = df[
            df["recordingId"].isin(recording_ids)
        ].copy()

        subset = subset.sort_values(
            ["recordingId", "timestampSeconds"]
        )

        # Physiological plausibility filter
        subset.loc[
            ~subset["heartRate"].between(30, 220),
            "heartRate"
        ] = np.nan

        subset.loc[
            ~subset["spo2"].between(50, 100),
            "spo2"
        ] = np.nan

        # Interpolate only within each recording.
        # Short gaps only, maximum 3 samples.
        for col in ["heartRate", "spo2"]:
            subset[col] = subset.groupby(
                "recordingId"
            )[col].transform(
                lambda s: s.interpolate(
                    limit=3,
                    limit_area="inside"
                )
            )

        # Preserve only complete observations
        subset = subset.dropna(
            subset=["heartRate", "spo2"]
        )

        output_file = OUTPUT / f"{name}.csv"
        subset.to_csv(output_file, index=False)

        summary[name] = {
            "recordings": len(recording_ids),
            "rows": len(subset),
            "file": str(output_file),
        }

        print(f"{name}: {summary[name]}")

    manifest = {
        "seed": SEED,
        "splits": {
            key: list(value)
            for key, value in splits.items()
        },
        "summary": summary,
    }

    with open(
        OUTPUT / "split_manifest.json",
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(manifest, f, indent=2)

    print("\nPreprocessing completed successfully")


if __name__ == "__main__":
    main()
