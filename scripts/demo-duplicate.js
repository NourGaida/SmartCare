// Run with: mongosh "mongodb://localhost:27017" scripts/demo-duplicate.js
// Inserts the same valid measurement twice, shows the E11000 error from
// uq_device_boot_sequence, then removes only the demo document.

const database = db.getSiblingDB("smartcare");
const measurements = database.measurements;

// Field types follow the measurements JSON schema in SchemaInitializer:
// sequence is int/long, heartRate and spo2 must be int for quality "good".
const demo = {
  deviceId: "demo-device",
  bootId: "demo-boot-" + Date.now(),
  sequence: NumberInt(1),
  acquiredAt: new Date(),
  receivedAt: new Date(),
  heartRate: NumberInt(72),
  spo2: NumberInt(98),
  quality: "good",
  reason: null,
  clockStatus: "synced",
  source: "demo",
  patientId: null,
  schemaVersion: NumberInt(1)
};

const key = {
  deviceId: demo.deviceId,
  bootId: demo.bootId,
  sequence: demo.sequence
};

try {
  measurements.insertOne(demo);
  print("SAVED");
} catch (error) {
  print("FIRST INSERT FAILED: " + error.message);
  quit(1);
}

try {
  measurements.insertOne(demo);
  print("SECOND INSERT UNEXPECTEDLY SUCCEEDED");
} catch (error) {
  if (error.code === 11000) {
    print("DUPLICATE REJECTED: " + error.message);
  } else {
    print("SECOND INSERT FAILED WITH UNEXPECTED ERROR: " + error.message);
  }
} finally {
  const cleanup = measurements.deleteOne(key);
  print("CLEANUP: deleted " + cleanup.deletedCount + " demo document(s)");
}
