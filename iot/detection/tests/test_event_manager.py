from types import SimpleNamespace

from event_manager import EventManager


def result(sequence, status, anomaly_type=None):
    return SimpleNamespace(
        device_id="sc-001",
        sequence=sequence,
        status=status,
        anomaly_type=anomaly_type,
    )


def test_anomaly_started():
    manager = EventManager()

    event = manager.process(
        result(11, "ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    assert event is not None
    assert event.event_type == "ANOMALY_STARTED"
    assert event.anomaly_type == "LOW_SPO2"


def test_sustained_anomaly_confirmed():
    manager = EventManager()

    for seq in range(11, 21):
        manager.process(result(seq, "ANOMALY", "LOW_SPO2"), "boot-001")

    event = manager.process(
        result(21, "SUSTAINED_ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    assert event is not None
    assert event.event_type == "SUSTAINED_ANOMALY_CONFIRMED"


def test_no_duplicate_confirmation():
    manager = EventManager()

    for seq in range(11, 21):
        manager.process(result(seq, "ANOMALY", "LOW_SPO2"), "boot-001")
    manager.process(result(21, "SUSTAINED_ANOMALY", "LOW_SPO2"), "boot-001")

    event = manager.process(
        result(22, "SUSTAINED_ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    assert event is None


def test_anomaly_resolved():
    manager = EventManager()

    for seq in range(11, 21):
        manager.process(result(seq, "ANOMALY", "LOW_SPO2"), "boot-001")
    manager.process(result(21, "SUSTAINED_ANOMALY", "LOW_SPO2"), "boot-001")

    manager.process(
        result(22, "SUSTAINED_ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    event = manager.process(
        result(23, "NORMAL"),
        "boot-001",
    )

    assert event is not None
    assert event.event_type == "ANOMALY_RESOLVED"
    assert event.anomaly_type == "LOW_SPO2"


def test_duplicate_measurement_ignored():
    manager = EventManager()

    event = manager.process(
        result(11, "DUPLICATE"),
        "boot-001",
    )

    assert event is None

def test_invalid_signal_interrupts_episode():
    manager = EventManager()

    manager.process(
        result(11, "ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    manager.process(
        result(21, "SUSTAINED_ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    interrupted = manager.process(
        result(22, "INVALID", "SIGNAL_QUALITY"),
        "boot-001",
    )

    recovered = manager.process(
        result(23, "NORMAL"),
        "boot-001",
    )

    assert interrupted is None
    assert recovered is None

def test_missing_sequence_starts_new_episode():
    manager = EventManager()

    manager.process(
        result(11, "ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    manager.process(
        result(21, "SUSTAINED_ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    # Sequence gap: previous detection episode is interrupted.
    new_episode = manager.process(
        result(26, "ANOMALY", "LOW_SPO2"),
        "boot-001",
    )

    assert new_episode is not None
    assert new_episode.event_type == "ANOMALY_STARTED"

    recovered = manager.process(
        result(27, "NORMAL"),
        "boot-001",
    )

    assert recovered is None
