import io
import json
import unittest
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

from SmartCare.simulator import simulator


class FakeClock:
    def __init__(self):
        self.elapsed = 0
        self.events = []
        self.start = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def now(self):
        return self.start + timedelta(seconds=self.elapsed)

    def monotonic(self):
        return self.elapsed

    def sleep(self, seconds):
        if seconds < 0:
            raise AssertionError("Negative sleep")
        self.events.append(("sleep", self.elapsed, seconds))
        self.elapsed += seconds


class RecordingTransport:
    def __init__(self, clock):
        self.clock = clock
        self.connected = False
        self.messages = []

    def connect(self):
        self.connected = True
        self.clock.events.append(("connect", self.clock.elapsed))

    def publish(self, topic, payload):
        if not self.connected:
            raise AssertionError("Publishing while disconnected")
        self.messages.append((topic, payload))
        self.clock.events.append(("publish", self.clock.elapsed))

    def close(self):
        self.connected = False
        self.clock.events.append(("close", self.clock.elapsed))


class ScenarioTests(unittest.TestCase):
    def run_scenario(self, name, seed=42, device_id="sc-001"):
        clock = FakeClock()
        transport = RecordingTransport(clock)
        runner = simulator.Simulator(
            transport, clock, device_id=device_id, seed=seed, boot_id="test-boot"
        )
        with redirect_stdout(io.StringIO()):
            runner.run(name)
        readings = [json.loads(payload) for _, payload in transport.messages]
        return readings, transport, clock

    def assert_normal(self, readings):
        for reading in readings:
            self.assertIn(reading["heartRate"], range(72, 79))
            self.assertIn(reading["spo2"], range(97, 100))
            self.assertEqual(reading["quality"], "good")
            self.assertIsNone(reading["reason"])

    def assert_cadence(self, readings):
        timestamps = [datetime.fromisoformat(r["acquiredAtUtc"]) for r in readings]
        for before, after in zip(timestamps, timestamps[1:]):
            self.assertEqual(after - before, timedelta(seconds=1))

    def test_normal_values_variations_and_one_second_cadence(self):
        readings, transport, clock = self.run_scenario("normal")
        self.assertEqual(len(readings), 15)
        self.assert_normal(readings)
        self.assert_cadence(readings)
        self.assertEqual([r["sequence"] for r in readings], list(range(1, 16)))
        self.assertGreater(len({r["heartRate"] for r in readings}), 1)
        self.assertGreater(len({r["spo2"] for r in readings}), 1)
        self.assertEqual(clock.elapsed, 15)
        self.assertFalse(transport.connected)

    def test_single_isolated_spike_with_normal_recovery(self):
        readings, _, _ = self.run_scenario("spike")
        self.assertEqual(len(readings), 26)
        self.assert_normal(readings[:10])
        self.assertEqual(readings[10]["heartRate"], 180)
        self.assertEqual(readings[10]["spo2"], 98)
        self.assertEqual(readings[10]["quality"], "good")
        self.assert_normal(readings[11:])
        self.assert_cadence(readings)

    def test_twelve_consecutive_abnormal_readings_with_recovery(self):
        readings, _, _ = self.run_scenario("sustained")
        self.assertEqual(len(readings), 37)
        self.assert_normal(readings[:10])
        for reading in readings[10:22]:
            self.assertEqual((reading["heartRate"], reading["spo2"]), (125, 93))
            self.assertEqual(reading["quality"], "good")
        self.assert_normal(readings[22:])
        self.assert_cadence(readings)

    def test_missing_slots_skip_sequences_and_timestamps_while_connected(self):
        readings, _, clock = self.run_scenario("missing")
        self.assertEqual(len(readings), 15)
        self.assert_normal(readings)
        self.assertEqual([r["sequence"] for r in readings],
                         list(range(1, 6)) + list(range(12, 22)))
        before = datetime.fromisoformat(readings[4]["acquiredAtUtc"])
        after = datetime.fromisoformat(readings[5]["acquiredAtUtc"])
        self.assertEqual(after - before, timedelta(seconds=7))
        self.assert_cadence(readings[:5])
        self.assert_cadence(readings[5:])
        self.assertEqual([e for e in clock.events if e[0] == "connect"],
                         [("connect", 0)])
        self.assertEqual([e for e in clock.events if e[0] == "close"],
                         [("close", 21)])
        published_at = [e[1] for e in clock.events if e[0] == "publish"]
        self.assertEqual(published_at, list(range(5)) + list(range(11, 21)))

    def test_duplicates_have_exactly_identical_serialized_payloads(self):
        readings, transport, _ = self.run_scenario("duplicates")
        self.assertEqual(len(readings), 2)
        self.assertEqual(transport.messages[0], transport.messages[1])
        for field in ("deviceId", "bootId", "sequence", "acquiredAtUtc"):
            self.assertEqual(readings[0][field], readings[1][field])
        self.assertEqual(readings[0]["sequence"], 1)

    def test_disconnect_closes_waits_35_seconds_and_reconnects(self):
        readings, transport, clock = self.run_scenario("disconnect")
        self.assertEqual(len(readings), 15)
        self.assert_normal(readings)
        self.assertEqual([r["sequence"] for r in readings], list(range(1, 16)))
        self.assertEqual({r["bootId"] for r in readings}, {"test-boot"})
        lifecycle = [e for e in clock.events if e[0] in ("connect", "close")]
        self.assertEqual(lifecycle, [
            ("connect", 0), ("close", 5), ("connect", 40), ("close", 50),
        ])
        self.assertIn(("sleep", 5, 35), clock.events)
        self.assertFalse(any(e[0] == "publish" and 5 <= e[1] < 40
                             for e in clock.events))
        before = datetime.fromisoformat(readings[4]["acquiredAtUtc"])
        after = datetime.fromisoformat(readings[5]["acquiredAtUtc"])
        self.assertEqual(after - before, timedelta(seconds=36))
        self.assert_cadence(readings[:5])
        self.assert_cadence(readings[5:])
        self.assertFalse(transport.connected)

    def test_invalid_null_values_and_reason_surrounded_by_normal_readings(self):
        readings, _, _ = self.run_scenario("invalid")
        self.assertEqual(len(readings), 18)
        self.assert_normal(readings[:5])
        for reading in readings[5:8]:
            self.assertIsNone(reading["heartRate"])
            self.assertIsNone(reading["spo2"])
            self.assertEqual(reading["quality"], "invalid")
            self.assertEqual(reading["reason"], "no_finger")
        self.assert_normal(readings[8:])
        self.assert_cadence(readings)

    def test_each_scenario_is_reproducible_with_same_seed(self):
        for name in simulator.SCENARIOS + ("all",):
            with self.subTest(scenario=name):
                first, _, _ = self.run_scenario(name, seed=42)
                second, _, _ = self.run_scenario(name, seed=42)
                self.assertEqual(first, second)
        other_seed, _, _ = self.run_scenario("normal", seed=43)
        default_seed, _, _ = self.run_scenario("normal", seed=42)
        self.assertNotEqual(other_seed, default_seed)

    def test_all_preserves_message_shape_topic_device_and_boot(self):
        readings, transport, _ = self.run_scenario("all", device_id="sc-test")
        self.assertEqual(len(readings), 128)
        expected_keys = {
            "schemaVersion", "deviceId", "bootId", "sequence", "acquiredAtUtc",
            "heartRate", "spo2", "quality", "reason", "clockStatus", "source",
        }
        for topic, payload in transport.messages:
            reading = json.loads(payload)
            self.assertEqual(topic, "smartcare/v1/raw/sc-test")
            self.assertEqual(set(reading), expected_keys)
            self.assertEqual(reading["deviceId"], "sc-test")
            self.assertEqual(reading["bootId"], "test-boot")
            self.assertEqual(reading["schemaVersion"], 1)
            self.assertEqual(reading["source"], "simulated")
            self.assertEqual(reading["clockStatus"], "synced")
            self.assertEqual(datetime.fromisoformat(
                reading["acquiredAtUtc"]).utcoffset(), timedelta(0))
        self.assertEqual(readings[-1]["sequence"], 133)

    def test_publication_time_does_not_accumulate_into_cadence(self):
        clock = FakeClock()
        transport = RecordingTransport(clock)
        publish = transport.publish

        def delayed_publish(topic, payload):
            publish(topic, payload)
            clock.elapsed += 0.25

        transport.publish = delayed_publish
        with redirect_stdout(io.StringIO()):
            simulator.Simulator(transport, clock).run("normal")
        self.assertEqual([e[1] for e in clock.events if e[0] == "publish"],
                         list(range(15)))
        self.assertEqual(clock.elapsed, 15)

    def test_cleanup_on_connect_publish_reconnect_errors_and_interrupt(self):
        for stage in ("connect", "publish", "reconnect", "interrupt"):
            with self.subTest(stage=stage):
                clock = FakeClock()
                transport = RecordingTransport(clock)
                error = KeyboardInterrupt if stage == "interrupt" else RuntimeError
                if stage == "connect":
                    transport.connect = Mock(side_effect=error("connect failed"))
                elif stage == "reconnect":
                    transport.connect = Mock(side_effect=[
                        None, error("reconnect failed"),
                    ])
                    transport.connected = True
                else:
                    transport.publish = Mock(side_effect=error("publish failed"))
                with redirect_stdout(io.StringIO()), self.assertRaises(error):
                    simulator.Simulator(transport, clock).run("disconnect")
                self.assertEqual(clock.events[-1][0], "close")
                self.assertFalse(transport.connected)


class MqttTransportTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.connect.return_value = simulator.mqtt.MQTT_ERR_SUCCESS
        self.client.loop_start.return_value = simulator.mqtt.MQTT_ERR_SUCCESS
        self.client.is_connected.return_value = True
        self.factory = patch.object(simulator.mqtt, "Client",
                                    return_value=self.client)
        self.client_factory = self.factory.start()
        self.addCleanup(self.factory.stop)
        self.transport = simulator.MqttTransport("broker.test", 1884)
        self.client.loop_start.side_effect = self.acknowledge_connection

    def acknowledge_connection(self, reason_code=0):
        self.client.on_connect(self.client, None, {}, reason_code, None)
        return simulator.mqtt.MQTT_ERR_SUCCESS

    def test_version2_unique_client_ids_and_no_automatic_reconnect(self):
        first = self.client_factory.call_args.kwargs
        simulator.MqttTransport()
        second = self.client_factory.call_args.kwargs
        self.assertEqual(first["callback_api_version"],
                         simulator.mqtt.CallbackAPIVersion.VERSION2)
        self.assertIn(str(simulator.os.getpid()), first["client_id"])
        self.assertNotEqual(first["client_id"], second["client_id"])
        self.assertFalse(first["reconnect_on_failure"])

    def test_successful_connection_waits_for_callback(self):
        self.transport.connect()
        self.client.connect.assert_called_once_with("broker.test", 1884, keepalive=60)
        self.client.loop_start.assert_called_once_with()
        self.assertTrue(self.transport._connected.is_set())

    def test_rejected_connack(self):
        self.client.loop_start.side_effect = lambda: self.acknowledge_connection(135)
        with self.assertRaisesRegex(RuntimeError, "rejected"):
            self.transport.connect()

    def test_initial_connect_return_code_is_checked(self):
        self.client.connect.return_value = simulator.mqtt.MQTT_ERR_NO_CONN
        with self.assertRaisesRegex(RuntimeError, "connection failed"):
            self.transport.connect()
        self.client.loop_start.assert_not_called()

    def test_network_loop_return_code_is_checked(self):
        self.client.loop_start.side_effect = None
        self.client.loop_start.return_value = simulator.mqtt.MQTT_ERR_INVAL
        with self.assertRaisesRegex(RuntimeError, "network loop failed"):
            self.transport.connect()

    def test_connection_lost_immediately_after_ack(self):
        self.client.is_connected.return_value = False
        with self.assertRaisesRegex(RuntimeError, "connection lost"):
            self.transport.connect()

    def test_callback_timeout_is_bounded_and_cleared_for_reconnect(self):
        self.transport.connect()
        self.client.loop_start.side_effect = None
        with patch.object(self.transport, "_connected") as event:
            event.wait.return_value = False
            with patch.object(simulator.time, "monotonic", side_effect=[100, 103]):
                with self.assertRaisesRegex(RuntimeError, "timed out"):
                    self.transport.connect()
            event.clear.assert_called_once_with()
            event.wait.assert_called_once_with(timeout=7)

    def test_qos1_checks_result_waits_with_timeout_and_checks_ack(self):
        result = self.client.publish.return_value
        result.rc = simulator.mqtt.MQTT_ERR_SUCCESS
        result.is_published.return_value = True
        with redirect_stdout(io.StringIO()):
            self.transport.publish("topic", '{"test": 1}')
        self.client.publish.assert_called_once_with("topic", '{"test": 1}', qos=1)
        result.wait_for_publish.assert_called_once_with(timeout=10)
        result.is_published.assert_called_once_with()

    def test_publish_error_does_not_wait(self):
        result = self.client.publish.return_value
        result.rc = simulator.mqtt.MQTT_ERR_NO_CONN
        with self.assertRaisesRegex(RuntimeError, "publishing failed"):
            self.transport.publish("topic", "{}")
        result.wait_for_publish.assert_not_called()

    def test_missing_puback_is_an_error(self):
        result = self.client.publish.return_value
        result.rc = simulator.mqtt.MQTT_ERR_SUCCESS
        result.is_published.return_value = False
        with self.assertRaisesRegex(RuntimeError, "not acknowledged"):
            self.transport.publish("topic", "{}")

    def test_real_transport_cleanup_after_connect_or_publish_failure(self):
        for stage in ("connect", "publish", "wait"):
            with self.subTest(stage=stage):
                self.client.reset_mock()
                self.client.connect.side_effect = (
                    OSError("connection refused") if stage == "connect" else None
                )
                result = self.client.publish.return_value
                result.rc = (simulator.mqtt.MQTT_ERR_NO_CONN if stage == "publish"
                             else simulator.mqtt.MQTT_ERR_SUCCESS)
                result.wait_for_publish.side_effect = RuntimeError("connection lost")
                with redirect_stdout(io.StringIO()), self.assertRaises(
                        (OSError, RuntimeError)):
                    simulator.Simulator(self.transport, FakeClock()).run("normal")
                self.client.disconnect.assert_called_once_with()
                self.client.loop_stop.assert_called_once_with()

    def test_loop_stops_even_when_disconnect_raises(self):
        self.client.disconnect.side_effect = OSError("disconnect failed")
        with self.assertRaises(OSError):
            self.transport.close()
        self.client.loop_stop.assert_called_once_with()


class CliTests(unittest.TestCase):
    def test_defaults(self):
        args = simulator.parse_args([])
        self.assertEqual((args.scenario, args.host, args.port, args.device_id, args.seed),
                         ("all", "localhost", 1883, "sc-001", 42))

    def test_cli_options_are_forwarded(self):
        with patch.object(simulator, "MqttTransport") as transport, patch.object(
                simulator, "Simulator") as runner:
            result = simulator.main([
                "--scenario", "missing", "--host", "broker.test", "--port", "1884",
                "--device-id", "sc-test", "--seed", "123",
            ])
            self.assertEqual(result, 0)
            transport.assert_called_once_with("broker.test", 1884)
            runner.assert_called_once_with(transport.return_value,
                                           device_id="sc-test", seed=123)
            runner.return_value.run.assert_called_once_with("missing")

    def test_invalid_arguments_are_rejected(self):
        cases = [
            ["--scenario", "unknown"], ["--port", "0"], ["--port", "65536"],
            ["--device-id", ""], ["--device-id", "sc/001"],
            ["--device-id", "sc+"], ["--device-id", "sc#"],
        ]
        for args in cases:
            with self.subTest(args=args), patch("sys.stderr", io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    simulator.parse_args(args)
                self.assertEqual(error.exception.code, 2)

    def test_runtime_failure_returns_nonzero_exit_code(self):
        with patch.object(simulator, "Simulator") as runner, patch(
                "sys.stderr", io.StringIO()):
            runner.return_value.run.side_effect = RuntimeError("broker unavailable")
            self.assertEqual(simulator.main(["--scenario", "normal"]), 1)


if __name__ == "__main__":
    unittest.main()
