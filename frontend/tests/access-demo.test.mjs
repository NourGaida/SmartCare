// FRONTEND ONLY: actual demo adapters + in-memory live transport. No real REST or WebSocket.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAuth, DEMO_ACCOUNTS } from '../shared/auth.mjs';
import { AccessError } from '../shared/domain.mjs';
import { createDemoUpdates } from '../shared/demo-updates.mjs';
import { createPatientAdapter } from '../patient/adapter.mjs';
import { createSupervisionAdapter } from '../supervision/adapter.mjs';
import { mountConnectivity } from '../shared/connectivity.mjs';
import { accessCases, accessFixtures } from './fixtures/access.mjs';

const now = () => Date.now();
async function setup(actor) {
  const fixture = accessFixtures();
  const updates = createDemoUpdates();
  const auth = createDemoAuth(['professional', 'administrator']);
  let api;
  if (actor === 'patient') {
    api = createPatientAdapter(now, {
      updates, loadReadings: (_, patientId) => structuredClone(fixture.readings[patientId])
    });
    await api.login(DEMO_ACCOUNTS.patient);
  } else {
    await auth.login(DEMO_ACCOUNTS[actor]);
    api = createSupervisionAdapter(auth, {
      updates, administrativeData: {
        patients: fixture.patients, assignments: fixture.assignments,
        accounts: [], devices: [], services: []
      },
      loadClinical: async () => structuredClone({ readings: fixture.readings, alerts: [] })
    });
  }
  return { fixture, updates, api };
}

for (const surface of ['history', 'csv', 'live']) {
  for (const scenario of accessCases) {
    test('DEMO ' + surface + ': ' + scenario.name, async () => {
      const { fixture, updates, api } = await setup(scenario.actor);
      const received = [];
      const options = { patientId: scenario.patientId, minutes: 'all' };
      const patient = scenario.actor === 'patient';
      const read = () => {
        if (surface === 'history') return patient ? api.getHistory(options) : api.getHistory(scenario.patientId);
        if (surface === 'csv') return patient ? api.exportCSV(options) : api.exportCSV(scenario.patientId);
        return patient ? api.subscribeUpdates(options, data => received.push(data))
          : api.subscribeUpdates(scenario.patientId, data => received.push(data));
      };
      const shouldDeny = !scenario.allowed && !scenario.sessionSubject;
      if (shouldDeny) await assert.rejects(async () => read(), AccessError);
      else {
        const result = await read();
        if (surface !== 'live') {
          const serialized = JSON.stringify(result);
          assert.ok(serialized.includes('ACCESS-TEST-DEVICE-1'), 'Own/assigned fixture must actually be returned.');
          assert.ok(!serialized.includes('ACCESS-TEST-DEVICE-2'), 'Other patient must never be returned.');
        }
      }
      // Send both channels even after a rejected direct subscription attempt.
      for (const [id, readings] of Object.entries(fixture.readings)) updates.publish(id, readings[0]);
      if (surface === 'live') {
        if (shouldDeny) assert.deepEqual(received, []);
        else {
          assert.equal(received.length, 1);
          assert.equal(received[0].patientId, 'patient-001');
          assert.equal(received[0].deviceId, 'ACCESS-TEST-DEVICE-1');
        }
      } else assert.deepEqual(received, []);
      api.logout();
      for (const [id, readings] of Object.entries(fixture.readings)) updates.publish(id, readings[0]);
      if (surface === 'live' && !shouldDeny) assert.equal(received.length, 1, 'Logout must stop live delivery.');
    });
  }
}

test('DEMO explicit unsubscribe stops live updates', async () => {
  const { api, updates, fixture } = await setup('professional');
  const received = [];
  const stop = api.subscribeUpdates('patient-001', reading => received.push(reading));
  stop();
  updates.publish('patient-001', fixture.readings['patient-001'][0]);
  assert.deepEqual(received, []);
  api.logout();
});

test('offline notice distinguishes static demo from unavailable server health data and recovers', () => {
  const events = new EventTarget();
  const network = { onLine: true };
  const element = { textContent: '', hidden: true };
  const stop = mountConnectivity(element, { network, events });
  assert.equal(element.hidden, true);
  network.onLine = false; events.dispatchEvent(new Event('offline'));
  assert.equal(element.hidden, false);
  assert.match(element.textContent, /Server measurements, history and alerts are unavailable/);
  assert.match(element.textContent, /no saved health data/);
  network.onLine = true; events.dispatchEvent(new Event('online'));
  assert.equal(element.hidden, true);
  stop();
});
