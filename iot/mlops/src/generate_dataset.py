
import argparse
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

# Reuse the existing SmartCare simulator
PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT / "IoT" / "simulator"))

from simulator import Simulator, SCENARIOS


class VirtualClock:
    def __init__(self):
        self.elapsed = 0.0
        self.start = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def now(self):
        return self.start + timedelta(seconds=self.elapsed)

    def monotonic(self):
        return self.elapsed

    def sleep(self, seconds):
        self.elapsed += max(0, seconds)


class MemoryTransport:
    def __init__(self):
        self.messages = []

    def connect(self):
        pass

    def close(self):
        pass

    def publish(self, topic, payload):
        self.messages.append(json.loads(payload))


def generate_dataset(sessions_per_scenario=30, seed=42):
    rows = []

    for scenario in SCENARIOS:
        for session_index in range(sessions_per_scenario):
            session_id = f"{scenario}-{session_index:04d}"
            clock = VirtualClock()
            transport = MemoryTransport()

            # Independent but reproducible random seed
            session_seed = seed + session_index
            device_id = "sc-001"

            simulator = Simulator(
                transport=transport,
                clock=clock,
                device_id=device_id,
                seed=session_seed,
                boot_id=session_id,
            )

            simulator.run(scenario=scenario)

            for message in transport.messages:
                hr = message["heartRate"]
                spo2 = message["spo2"]

                # Synthetic point-level anomaly labels
                abnormal = (
                    hr is not None
                    and spo2 is not None
                    and (hr > 120 or hr < 50 or spo2 < 94)
                )

                rows.append({
                    **message,
                    "sessionId": session_id,
                    "scenario": scenario,
                    "label": int(abnormal),
                })

    df = pd.DataFrame(rows)

    # Keep all rows for auditing, including duplicates
    df = df.sort_values(
        ["sessionId", "sequence", "acquiredAtUtc"],
        kind="stable"
    ).reset_index(drop=True)

    return df


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sessions", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.sessions < 1:
        parser.error("--sessions must be >= 1")

    df = generate_dataset(args.sessions, args.seed)

    output_dir = PROJECT_ROOT / "IoT" / "mlops" / "data" / "raw"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "smartcare_synthetic.csv"
    df.to_csv(output_path, index=False)

    print("\nDataset generated successfully")
    print(f"Path: {output_path}")
    print(f"Rows: {len(df)}")
    print(f"Sessions: {df['sessionId'].nunique()}")
    print("\nScenario distribution:")
    print(df["scenario"].value_counts().to_string())
    print("\nPoint anomaly labels:")
    print(df["label"].value_counts().to_string())


if __name__ == "__main__":
    main()
