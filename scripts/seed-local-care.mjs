import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const password = process.env.SMARTCARE_SEED_PASSWORD;
const database = process.env.SMARTCARE_CARE_DATABASE || 'smartcare';
if (!password || password.length < 10 || password.length > 100 || !/^[A-Za-z0-9_-]+$/.test(database)) {
  console.error('Use init-local-care.ps1 and a valid local database name.');
  process.exit(1);
}

function passwordHash() {
  const iterations = 210000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return ['pbkdf2', 'PBKDF2WithHmacSHA256', iterations, salt.toString('base64'), hash.toString('base64')].join('$');
}

const patients = [
  { id: 'sc-patient-hadil', name: 'Hadil Karous', email: 'hadil.karous@smartcare.local', device: 'sc-test-hadil' },
  { id: 'sc-patient-nour-shili', name: 'Nour Shili', email: 'nour.shili@smartcare.local', device: 'sc-test-nour-shili' },
  { id: 'sc-patient-nour-gaida', name: 'Nour Gaida', email: 'nour.gaida@smartcare.local', device: 'sc-test-nour-gaida' }
];
const professional = { id: 'sc-prof-ali', name: 'Dr Ali Ben Ali', email: 'ali.benali@smartcare.local' };
const users = [...patients.map(patient => ({ ...patient, role: 'PATIENT' })), { ...professional, role: 'PROFESSIONAL' }]
  .map(user => ({ userId: user.id, displayName: user.name, email: user.email, role: user.role,
    active: true, passwordHash: passwordHash() }));

// Feed only hashes to mongosh via stdin. Never place them in process arguments or logs.
const command = `
const users = ${JSON.stringify(users)};
const patients = ${JSON.stringify(patients)};
const professionalId = ${JSON.stringify(professional.id)};
try {
  const now = new Date();
  const windowStart = Math.floor(now.getTime() / 300000) * 300000;
  const bootId = "connected-fixture-v1-" + windowStart;
  const firstReading = windowStart - 30000;
  for (const user of users) {
    const found = db.users.findOne({ $or: [{userId: user.userId}, {email: user.email}] });
    if (found && (found.userId !== user.userId || found.email !== user.email ||
        found.role !== user.role || found.active !== true || found.displayName !== user.displayName)) {
      throw new Error("Account collision for " + user.email + ". Existing data was preserved.");
    }
  }
  for (const patient of patients) {
    const device = db.devices.findOne({deviceId: patient.device});
    if (device && (device.status !== "ENROLLED" || device.simulationEnabled !== true)) {
      throw new Error("Device collision for " + patient.device + ". Existing data was preserved.");
    }
    const other = db.device_ownership.findOne({deviceId: patient.device, patientId: {$ne: patient.id}, $or: [
      {validTo:null}, {validTo:{$gt:new Date(firstReading)}}]});
    if (other) throw new Error("Device ownership collision for " + patient.device + ". Existing data was preserved.");
  }
  db.users.createIndex({userId:1},{name:"uq_user_id",unique:true});
  db.users.createIndex({email:1},{name:"uq_user_email",unique:true});
  db.devices.createIndex({deviceId:1},{name:"uq_device_id",unique:true});
  db.device_ownership.createIndex({deviceId:1},{name:"uq_device_open_ownership",unique:true,partialFilterExpression:{validTo:null}});
  db.assignments.createIndex({professionalId:1,patientId:1},{name:"uq_professional_patient",unique:true});
  db.measurements.createIndex({deviceId:1,bootId:1,sequence:1},{name:"uq_device_boot_sequence",unique:true});

  let accountsAdded = 0;
  let measurementsAdded = 0;
  for (const user of users) {
    accountsAdded += db.users.updateOne({userId:user.userId},
        {$setOnInsert:{...user,createdAt:now}}, {upsert:true}).upsertedCount;
  }
  for (const [index, patient] of patients.entries()) {
    const deviceId = patient.device;
    db.devices.updateOne({deviceId}, {$setOnInsert:{status:"ENROLLED",enrolledAt:now,simulationEnabled:true}}, {upsert:true});
    db.device_ownership.updateOne({deviceId,patientId:patient.id,validTo:null},
      {$setOnInsert:{validFrom:new Date(firstReading - 86400000)}}, {upsert:true});
    db.assignments.updateOne({professionalId,patientId:patient.id}, {$setOnInsert:{createdAt:now}}, {upsert:true});
    const operations = Array.from({length:24}, (_, offset) => {
      const sequence = offset + 1;
      const acquiredAt = new Date(firstReading + offset * 1000);
      const heartRate = offset === 0 && index === 0 ? 75 : 68 + (offset * 7 + index * 4) % 15;
      const spo2 = offset === 0 && index === 0 ? 98 : 96 + (offset + index) % 4;
      return {updateOne:{filter:{deviceId,bootId,sequence},update:{$setOnInsert:{
        schemaVersion:1,patientId:patient.id,acquiredAt,receivedAt:now,heartRate,spo2,
        quality:"good",reason:null,clockStatus:"synced",source:"simulated",seedDataset:"connected-fixture-v1"
      }},upsert:true}};
    });
    measurementsAdded += db.measurements.bulkWrite(operations).upsertedCount;
  }
  print("SMARTCARE_OK accountsAdded=" + accountsAdded + " assignedPatients=3 measurementsAdded=" + measurementsAdded);
} catch (error) {
  const message = String(error.message);
  print("SMARTCARE_ERROR " + (/(collision for)/.test(message) ? message : "MongoDB could not initialize the test data."));
  quit(1);
}
`;

const result = spawnSync('docker', ['exec', '-i', 'smartcare-mongodb', 'mongosh', '--quiet', database, '--file', '/dev/stdin'],
  { input: command, encoding: 'utf8', timeout: 45000, windowsHide: true });
const summary = (result.stdout || '').split(/\r?\n/).find(line => /^SMARTCARE_(OK|ERROR) /.test(line));
if (result.status !== 0 || !summary?.startsWith('SMARTCARE_OK ')) {
  console.error(summary || 'Could not reach the local MongoDB container. Check Docker Desktop and smartcare-mongodb.');
  process.exit(1);
}
console.log(summary.slice('SMARTCARE_OK '.length));
