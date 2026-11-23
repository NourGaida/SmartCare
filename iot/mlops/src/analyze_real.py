
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports/bidmc"

def main():
    for split in ["train", "val", "test"]:
        df = pd.read_csv(
            REPORT_DIR / f"{split}_scores.csv"
        )

        summary = (
            df.groupby("recordingId")
            .agg(
                windows=("flagged", "size"),
                flagged_windows=("flagged", "sum"),
                flagged_fraction=("flagged", "mean"),
                mean_score=("anomalyScore", "mean"),
                max_score=("anomalyScore", "max"),
            )
            .sort_values(
                "flagged_fraction",
                ascending=False
            )
        )

        summary.to_csv(
            REPORT_DIR / f"{split}_recording_analysis.csv"
        )

        print(f"\n=== {split.upper()} ===")
        print(summary.head(10).to_string())

        plt.figure(figsize=(10, 4))
        plt.bar(
            summary.index,
            summary["flagged_fraction"] * 100
        )
        plt.ylabel("Flagged windows (%)")
        plt.xlabel("Recording ID")
        plt.title(f"BIDMC anomaly flags by recording — {split}")
        plt.xticks(rotation=90)
        plt.tight_layout()
        plt.savefig(
            REPORT_DIR / f"{split}_recording_analysis.png",
            dpi=160
        )
        plt.close()

if __name__ == "__main__":
    main()
