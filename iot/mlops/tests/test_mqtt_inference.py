from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import requests
from fastapi.testclient import TestClient

from iot.mlops.api import main, mqtt_inference


DEVICE = "sc-ml-validation"
PATIENT = "fixture-patient"
START = datetime(2026, 1, 1, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def clear_windows():
    mqtt_inference.buffers.clear()
    yield
    mqtt_inference.buffers.clear()


def reading(index, **overrides):
    return {
        "deviceId": DEVICE,
        "patientId": PATIENT,
        "timestamp": (START + timedelta(seconds=index)).isoformat(),
        "valid": True,
        "quality": "GOOD",
        "heartRate": 125,
        "spo2": 93,
        **overrides,
    }


def message(payload, topic=f"smartcare/v1/devices/{DEVICE}/readings"):
    return SimpleNamespace(topic=topic, payload=json.dumps(payload).encode())


def test_mqtt_shadow_observes_actual_prediction_without_publishing_an_alert(monkeypatch, capsys):
    results = []
    consumer = Mock()
    with TestClient(main.app) as api:
        def post(url, *, json, timeout):
            assert url == mqtt_inference.API_URL
            assert timeout == mqtt_inference.REQUEST_TIMEOUT_SECONDS
            response = api.post("/predict", json=json)
            results.append(response.json())
            return response

        request = Mock(side_effect=post)
        monkeypatch.setattr(mqtt_inference.requests, "post", request)
        for index in range(mqtt_inference.WINDOW_SIZE):
            mqtt_inference.on_message(consumer, None, message(reading(index)))

    assert len(results) == request.call_count == 1
    result = results[0]
    assert result["mode"] == "shadow"
    assert result["clinicalAlert"] is False
    logs = capsys.readouterr().out
    assert f"Score: {result['anomalyScore']}" in logs
    assert f"Flagged: {result['flagged']}" in logs
    assert "Mode: shadow" in logs
    consumer.publish.assert_not_called()


def test_slow_inference_times_out_and_rule_detection_continues(monkeypatch, capsys):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[2] / "detection"))
    import mqtt_detector as rule

    def post(url, *, json, timeout):
        assert url == mqtt_inference.API_URL
        assert len(json["measurements"]) == mqtt_inference.WINDOW_SIZE
        assert timeout == mqtt_inference.REQUEST_TIMEOUT_SECONDS
        # Transport double: the candidate would respond after the configured timeout.
        raise requests.ReadTimeout("candidate response overdue")

    request = Mock(side_effect=post)
    monkeypatch.setattr(mqtt_inference.requests, "post", request)
    monkeypatch.setattr(rule, "event_manager", rule.EventManager())
    consumer = Mock()
    rule_client = Mock()
    rule_client.publish.return_value.rc = rule.mqtt.MQTT_ERR_SUCCESS

    for index in range(12):
        row = reading(index)
        mqtt_inference.on_message(consumer, None, message(row))
        rule_measurement = {
            "deviceId": DEVICE,
            "bootId": "fixture-rules-fallback",
            "sequence": index,
            "acquiredAtUtc": row["timestamp"],
            "quality": "good",
            "heartRate": row["heartRate"],
            "spo2": row["spo2"],
        }
        rule.on_message(rule_client, None, message(rule_measurement, f"{rule.MQTT_PREFIX}/{DEVICE}"))

    assert request.call_count == 12 - mqtt_inference.WINDOW_SIZE + 1
    logs = capsys.readouterr().out
    assert "FastAPI request failed: candidate response overdue" in logs
    assert "--- ML PREDICTION ---" not in logs
    consumer.publish.assert_not_called()
    events = [json.loads(call.kwargs["payload"]) for call in rule_client.publish.call_args_list]
    assert [event["eventType"] for event in events] == ["ANOMALY_STARTED", "SUSTAINED_ANOMALY_CONFIRMED"]


@pytest.mark.parametrize(("updates", "note"), [
    ({"valid": False, "quality": "INVALID"}, "Invalid measurement ignored"),
    ({"heartRate": 221}, "Out-of-range measurement ignored"),
])
def test_ineligible_mqtt_sample_clears_the_window(monkeypatch, capsys, updates, note):
    request = Mock()
    monkeypatch.setattr(mqtt_inference.requests, "post", request)
    for index in range(mqtt_inference.WINDOW_SIZE - 1):
        mqtt_inference.on_message(None, None, message(reading(index)))
    mqtt_inference.on_message(None, None, message(reading(index + 1, **updates)))
    request.assert_not_called()
    assert (DEVICE, PATIENT) not in mqtt_inference.buffers
    assert note in capsys.readouterr().out
