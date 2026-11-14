import { createDemoAuth } from '../shared/auth.mjs';
import { requireRole, filterReadings, readingsCSV, AccessError } from '../shared/domain.mjs';
import { createDemoUpdates } from '../shared/demo-updates.mjs';
import { initialReadings, makeReading, demoAlert } from './fixtures.mjs';

export function createPatientAdapter(now = () => Date.now(), {
  loadReadings = initialReadings, updates = createDemoUpdates()
} = {}) {
  const auth = createDemoAuth(['patient']);
  let readings = [], alerts = [], sequence = 3600;
  const subscriptions = new Set();
  const guard = () => requireRole(auth.getSession(), 'patient');
  return {
    async login(credentials) {
      const session = await auth.login(credentials);
      subscriptions.forEach(stop => stop()); subscriptions.clear();
      readings.length = 0; alerts.length = 0;
      readings = loadReadings(now(), session.id); alerts = []; sequence = 3600;
      return session;
    },
    logout() {
      subscriptions.forEach(stop => stop()); subscriptions.clear();
      readings.length = 0; alerts.length = 0; sequence = 0; auth.logout();
    },
    getSession: auth.getSession,
    getReadings() { guard(); return readings; },
    getHistory(filters) { guard(); return filterReadings(readings, filters); },
    exportCSV(filters) { guard(); return readingsCSV(filterReadings(readings, filters)); },
    subscribeUpdates(options, receive) {
      guard();
      const owner = auth.getSession();
      // Like a /me route, the subject comes only from the session.
      // options.patientId is deliberately ignored, including for live delivery.
      const stop = updates.subscribe(owner.id, receive, () => {
        guard();
        if (auth.getSession() !== owner) throw new AccessError();
      });
      subscriptions.add(stop);
      return () => { stop(); subscriptions.delete(stop); };
    },
    getAlerts() { guard(); return alerts; },
    nextReading(valid = true) {
      guard(); const reading = makeReading(now(), ++sequence, valid);
      readings.push(reading);
      if (readings.length > 86400) readings.shift();
      updates.publish(auth.getSession().id, reading);
      return reading;
    },
    previewAlert() { guard(); const alert = demoAlert(alerts.length + 1, now()); alerts.push(alert); return alert; },
    getDevice() { guard(); return { id: 'SC-DEMO-001', patientId: auth.getSession().id, simulated: true }; }
  };
}
