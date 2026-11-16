
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from features import build_features


ROOT = Path(__file__).resolve().parents[1]
RAW_PATH = ROOT / "data" / "raw" / "smartcare_synthetic.csv"
OUTPUT_DIR = ROOT / "data" / "processed"


def main():
    df = pd.read_csv(RAW_PATH)

    # Split sessions, not individual measurements.
    sessions = (
        df[["sessionId", "scenario"]]
        .drop_duplicates()
        .sort_values("sessionId")
    )

    train_sessions, temp_sessions = train_test_split(
        sessions,
        test_size=0.30,
        random_state=42,
        stratify=sessions["scenario"],
    )

    val_sessions, test_sessions = train_test_split(
        temp_sessions,
        test_size=0.50,
        random_state=42,
        stratify=temp_sessions["scenario"],
    )

    features = build_features(df, window_size=5)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, subset in [
        ("train", train_sessions),
        ("val", val_sessions),
        ("test", test_sessions),
    ]:
        result = features[
            features["sessionId"].isin(subset["sessionId"])
        ]

        output_path = OUTPUT_DIR / f"{name}.csv"
        result.to_csv(output_path, index=False)

        print(
            f"{name}: {len(result)} windows, "
            f"{result['sessionId'].nunique()} sessions, "
            f"{int(result['label'].sum())} abnormal windows"
        )


if __name__ == "__main__":
    main()
