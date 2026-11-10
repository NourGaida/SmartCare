// Two fictional patients. Never seed real identities or production databases with this fixture.
export function accessFixtures(now = Date.now()) {
  const patients = [
    { id: 'patient-001', code: 'TEST-A', name: 'Demo Patient A' },
    { id: 'patient-002', code: 'TEST-B', name: 'Demo Patient B' }
  ];
  const readings = Object.fromEntries(patients.map((patient, index) => [patient.id, [{
    patientId: patient.id, timestamp: now, hr: 75 + index, spo2: 98,
    deviceId: 'ACCESS-TEST-DEVICE-' + (index + 1),
    bootId: index ? '68e7b06d-e86a-4031-805f-995aa4a54f8a' : '27f4d853-f969-4a05-afaf-693927dbb56a',
    sequence: 1, quality: 'good', reason: null, source: 'simulated'
  }]]));
  return {
    patients, readings, alerts: [],
    actors: {
      patient: { id: patients[0].id, role: 'patient' },
      otherPatient: { id: patients[1].id, role: 'patient' },
      professional: { id: 'pro-001', role: 'professional' },
      administrator: { id: 'admin-001', role: 'administrator' }
    },
    assignments: [{ patientId: patients[0].id, professionalId: 'pro-001' }]
  };
}

export const accessCases = [
  { name: 'patient changes the client identifier', actor: 'patient', patientId: 'patient-002', allowed: false, sessionSubject: true },
  { name: 'professional requests an unassigned patient', actor: 'professional', patientId: 'patient-002', allowed: false },
  { name: 'administrator requests health data', actor: 'administrator', patientId: 'patient-001', allowed: false },
  { name: 'patient requests own data', actor: 'patient', patientId: 'patient-001', allowed: true },
  { name: 'professional requests assigned patient', actor: 'professional', patientId: 'patient-001', allowed: true }
];

export const serverDependencies = {
  history: 'Person B: authenticated test sessions + implemented history REST route + DTO + seeded ownership/assignment.',
  csv: 'Person B: authenticated test sessions + implemented CSV export route + agreed filters and CSV fields.',
  live: 'Person B: authenticated WebSocket endpoint + subscription/denial protocol + deterministic test ingestion and two authorized control subscriptions.'
};
