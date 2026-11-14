// Loaded lazily only after a professional role and patient assignment check.
export function clinicalFixtures(now = Date.now()) {
  const readings = {};
  for (let patient = 1; patient <= 4; patient++) {
    const id = 'patient-00' + patient;
    const end = now - (patient === 2 ? 45000 : 0);
    readings[id] = [];
    for (let sequence = 1; sequence <= 3600; sequence++) {
      if (sequence >= 3300 && sequence < 3306) continue;
      const invalid = (sequence >= 3450 && sequence < 3456) || (patient === 3 && sequence >= 3598);
      const sustained = patient === 1 && sequence >= 3500 && sequence < 3512;
      readings[id].push({
        timestamp: end - (3600 - sequence) * 1000,
        hr: invalid ? null : sustained ? 125 : 75 + Math.round(Math.sin(sequence / 17 + patient) * 3),
        spo2: invalid ? null : sustained ? 93 : 98 + Math.round(Math.sin(sequence / 31)),
        quality: invalid ? 'invalid' : 'good', reason: invalid ? 'no_finger' : null,
        source: 'simulated', deviceId: 'SC-DEMO-00' + patient,
        bootId: 'demo-boot-' + patient, sequence
      });
    }
  }
  const episode = (id, patientId, title, reason, state, age) => ({
    id, patientId, title, reason, state, source: 'demo-rule', ruleVersion: 'demo-rules-v1',
    startedAt: now - age, endedAt: state === 'resolved' ? now - 60000 : null,
    measurements: readings[patientId].slice(-4),
    ...(state === 'acknowledged' ? { acknowledgedBy: 'Dr Morgan Ellis',
      acknowledgedById: 'pro-001', acknowledgedAt: now - 30000, note: 'Signal reviewed in the demonstration.' } : {})
  });
  const sustained = episode('alert-001', 'patient-001', 'Sustained reading episode', 'demo_sustained_reading', 'open', 100000);
  sustained.measurements = readings['patient-001'].filter(row => row.hr === 125);
  return { readings, alerts: [
    sustained,
    { ...episode('alert-002', 'patient-002', 'No recent measurements', 'missing_data', 'open', 45000), measurements: [] },
    episode('alert-003', 'patient-003', 'Signal quality needs attention', 'no_finger', 'acknowledged', 120000),
    episode('alert-004', 'patient-001', 'Previous demonstration episode', 'demo_signal', 'resolved', 300000),
    episode('alert-005', 'patient-004', 'Unassigned demonstration episode', 'demo_signal', 'open', 90000)
  ] };
}
