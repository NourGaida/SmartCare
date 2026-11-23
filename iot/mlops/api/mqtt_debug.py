
import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, reason_code, properties):
    print("Connected to MQTT:", reason_code)
    client.subscribe("smartcare/v1/#")

def on_message(client, userdata, msg):
    print("\nTopic:", msg.topic)
    print("Payload:", msg.payload.decode("utf-8", errors="replace"))

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

client.on_connect = on_connect
client.on_message = on_message

client.connect("127.0.0.1", 1883, 60)

print("Listening for SmartCare MQTT messages...")
client.loop_forever()
