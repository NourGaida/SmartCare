
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "bidmc"
OUTPUT_DIR = ROOT / "data" / "processed" / "bidmc"

def load_bidmc():
    frames = []

    files = sorted(RAW_DIR.glob("bidmc_*_Numerics.csv"))

    if not files:
        raise FileNotFoundError("No BIDMC CSV files found")

    for file in files:
        df = pd.read_csv(file)
        df.columns = df.columns.str.strip()

        required = {"Time [s]", "PULSE", "SpO2"}
        if not required.issubset(df.columns):
            raise ValueError(f"Missing columns in {file.name}")

        df = df.rename(columns={
            "Time [s]": "timestampSeconds",
            "PULSE": "heartRate",
            "SpO2": "spo2"
        })

        df["recordingId"] = file.stem.replace(
            "_Numerics", ""
        )

        df["source"] = "bidmc"

        frames.append(df[
            [
                "recordingId",
                "timestampSeconds",
                "heartRate",
                "spo2",
                "source"
            ]
        ])

    result = pd.concat(frames, ignore_index=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / "bidmc_combined.csv"

    result.to_csv(output, index=False)

    print(f"Loaded recordings: {len(files)}")
    print(f"Total measurements: {len(result)}")
    print(f"Saved: {output}")
    print(result.isna().sum())

    return result


if __name__ == "__main__":
    load_bidmc()
