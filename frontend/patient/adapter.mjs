import { createDemoAuth } from '../shared/auth.mjs';
import { requireRole, filterReadings } from '../shared/domain.mjs';
import { initialReadings, makeReading, demoAlert } from './fixtures.mjs';

export function createPatientAdapter(now = () => Date.now()) {
  const auth = createDemoAuth(['patient']);
  let readings = [], alerts = [], sequence = 3600;
  const guard = () => requireRole(auth.getSession(), 'patient');
  return {
    async login(credentials) {
      const session = await auth.login(credentials);
      readings = initialReadings(now()); alerts = []; sequence = 3600;
      return session;
    },
    logout() {
      readings.length = 0; alerts.length = 0; sequence = 0; auth.logout();
    },
    getSession: auth.getSession,
    getReadings() { guard(); return readings; },
    getHistory(filters) { guard(); return filterReadings(readings, filters); },
    getAlerts() { guard(); return alerts; },
    nextReading(valid = true) {
      guard(); const reading = makeReading(now(), ++sequence, valid);
      readings.push(reading);
      if (readings.length > 86400) readings.shift();
      return reading;
    },
    previewAlert() { guard(); const alert = demoAlert(alerts.length + 1, now()); alerts.push(alert); return alert; },
    getDevice() { guard(); return { id: 'SC-DEMO-001', patientId: auth.getSession().id, simulated: true }; }
  };
}
