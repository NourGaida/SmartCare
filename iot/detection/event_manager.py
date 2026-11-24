from dataclasses import dataclass
from typing import Optional


@dataclass
class DetectionEvent:
    device_id: str
    sequence: int
    event_type: str
    anomaly_type: Optional[str]
    started_sequence: Optional[int] = None


class EventManager:
    def __init__(self):
        self.episodes = {}

    def process(self, result, boot_id):
        device_id = result.device_id
        key = (device_id, boot_id)

        # A new boot starts a new detection session.
        if device_id not in self.episodes:
            self.episodes[device_id] = {
                "boot_id": boot_id,
                "anomaly_type": None,
                "confirmed": False,
            }

        episode = self.episodes[device_id]

        if episode["boot_id"] != boot_id:
            episode = {
                "boot_id": boot_id,
                "anomaly_type": None,
                "confirmed": False,
            }
            self.episodes[device_id] = episode

        status = result.status
        anomaly_type = result.anomaly_type

        # Ignore measurements that were already processed.
        last_sequence = episode.get("last_sequence", 0)

        if status in ("DUPLICATE", "OUT_OF_ORDER", "STALE_BOOT"):
            return None

        if result.sequence <= last_sequence:
            return None

        # A sequence gap interrupts the previous episode.
        if (
            getattr(result, "episode_interrupted", False)
            or (
                last_sequence > 0
                and result.sequence > last_sequence + 1
            )
        ):
            episode["anomaly_type"] = None
            episode["confirmed"] = False

        episode["last_sequence"] = result.sequence

        if status in ("DUPLICATE", "OUT_OF_ORDER", "STALE_BOOT"):
            return None

        if status == "INVALID":
            # Interrupt the current episode: signal quality is unreliable.
            episode["anomaly_type"] = None
            episode["confirmed"] = False
            return None

        if status in ("ANOMALY", "SUSTAINED_ANOMALY"):
            if episode["anomaly_type"] != anomaly_type:
                episode["anomaly_type"] = anomaly_type
                episode["confirmed"] = False
                episode["started_sequence"] = result.sequence

                return DetectionEvent(
                    device_id,
                    result.sequence,
                    "ANOMALY_STARTED",
                    anomaly_type,
                )

            if status == "SUSTAINED_ANOMALY" and not episode["confirmed"]:
                episode["confirmed"] = True

                return DetectionEvent(
                    device_id,
                    result.sequence,
                    "SUSTAINED_ANOMALY_CONFIRMED",
                    anomaly_type,
                    episode["started_sequence"],
                )

            return None

        if status == "NORMAL":
            if episode["anomaly_type"] is not None:
                previous_type = episode["anomaly_type"]
                was_confirmed = episode["confirmed"]

                episode["anomaly_type"] = None
                episode["confirmed"] = False

                if was_confirmed:
                    return DetectionEvent(
                        device_id,
                        result.sequence,
                        "ANOMALY_RESOLVED",
                        previous_type,
                    )

        return None
