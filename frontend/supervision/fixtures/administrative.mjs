// Registry and operations only. Never add readings or clinical alert details here.
export function administrativeFixtures(now = Date.now()) {
  return {
    patients: [
      { id: 'patient-001', code: 'SC-001', name: 'Jamie Davis', group: 'Demo ward A' },
      { id: 'patient-002', code: 'SC-002', name: 'Alex Morgan', group: 'Demo ward A' },
      { id: 'patient-003', code: 'SC-003', name: 'Sam Taylor', group: 'Demo ward B' },
      { id: 'patient-004', code: 'SC-004', name: 'Taylor Reed', group: 'Demo ward B' }
    ],
    accounts: [
      { id: 'admin-001', name: 'Robin Lee', email: 'admin@smartcare.demo', role: 'administrator', active: true },
      { id: 'pro-001', name: 'Dr Morgan Ellis', email: 'professional@smartcare.demo', role: 'professional', active: true },
      { id: 'pro-002', name: 'Dr Casey Jordan', email: 'casey@smartcare.demo', role: 'professional', active: true },
      { id: 'patient-001', name: 'Jamie Davis', email: 'patient@smartcare.demo', role: 'patient', active: true }
    ],
    assignments: [1, 2, 3].map(index => ({
      professionalId: 'pro-001', patientId: 'patient-00' + index
    })),
    devices: [1, 2, 3].map(index => ({
      id: 'SC-DEMO-00' + index, label: 'Demo sensor ' + index,
      patientId: 'patient-00' + index, status: 'active'
    })),
    services: [
      { id: 'api', name: 'Application API', available: true, checkedAt: now },
      { id: 'mqtt', name: 'MQTT ingestion', available: true, checkedAt: now },
      { id: 'model', name: 'Model service', available: false, checkedAt: now }
    ],
    model: { available: false, version: null, mode: null, checkedAt: now }
  };
}
