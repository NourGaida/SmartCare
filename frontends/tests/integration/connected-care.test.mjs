import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { normalizeMeasurements } from '../../frontoffice/measurements-adapter.mjs';
import { connectedAlerts } from '../../shared/connected-views.mjs';
import { scenarioResult } from '../../shared/scenario-view.mjs';

const password = process.env.SMARTCARE_SEED_PASSWORD;
const base = new URL(process.env.SMARTCARE_CARE_URL || 'http://localhost:8085/smartcare/');

function client() {
  let cookie = '';
  let csrf = '';
  async function call(path, body) {
    const headers = new Headers({ Accept: 'application/json' });
    if (cookie) headers.set('Cookie', cookie);
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(new URL('api/' + path, base), {
      method: body === undefined ? 'GET' : 'POST', headers, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(12000),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith('SMARTCARE_SESSION=')) cookie = value.split(';', 1)[0];
    }
    return { status: response.status, data: await response.json().catch(() => null) };
  }
  return {
    call,
    async login(email, secret) {
      const result = await call('auth/login', { email, password: secret });
      assert.equal(result.status, 200, 'Development account should log in');
      csrf = result.data.csrfToken;
      const session = await call('session');
      assert.equal(session.status, 200);
      return session.data;
    },
    async logout() {
      if (csrf) {
        await call('auth/logout', {});
        csrf = '';
      }
    }
  };
}

async function waitFor(check, seconds, message) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(1000);
  }
  assert.fail(message);
}

test('connected portals: registration, assignments, MQTT runs and persisted acknowledgement', {
  skip: !password ? 'Set SMARTCARE_SEED_PASSWORD from the local credential and run against the connected WAR and services.' : false,
  timeout: 190000
}, async t => {
  const patient = client();
  const staff = client();
  const newcomer = client();
  const hadilId = 'sc-patient-hadil';
  const hadilDevice = 'sc-test-hadil';
  const scope = 'patients/' + hadilId;
  t.after(async () => {
    await Promise.allSettled([patient.logout(), staff.logout(), newcomer.logout()]);
  });
  const health = await patient.call('health/ingestion');
  assert.equal(health.status, 200);
  assert.equal(health.data.connected, true);
  assert.equal((await patient.call('me/measurements')).status, 401);

  for (const [portal, entry] of [['frontoffice', './portal.mjs'], ['backoffice', '../shared/portal.mjs']]) {
    const page = await fetch(new URL('frontends/' + portal + '/', base), { signal: AbortSignal.timeout(5000) });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('src="' + entry + '"'));
    assert.doesNotMatch(html, /demo workspace|demo mode|sign in to demo/i);
  }

  const email = 'care-signup-' + randomUUID() + '@smartcare.invalid';
  const secret = randomBytes(24).toString('base64url');
  const invalid = await newcomer.call('auth/signup', { name: '', email, password: secret });
  assert.equal(invalid.status, 400);
  const created = await newcomer.call('auth/signup', { name: 'Patient vérification', email, password: secret, role: 'ADMIN' });
  assert.equal(created.status, 201);
  assert.equal(created.data.role, 'PATIENT');
  const duplicate = await newcomer.call('auth/signup', { name: 'Duplicate', email: email.toUpperCase(), password: secret });
  assert.equal(duplicate.status, 409);
  assert.equal((await newcomer.login(email, secret)).displayName, 'Patient vérification');
  assert.deepEqual((await newcomer.call('me/measurements')).data.measurements, []);
  assert.deepEqual((await newcomer.call('me/alerts')).data.alerts, []);
  assert.equal((await newcomer.call('patients')).status, 403);
  await newcomer.logout();
  assert.equal((await newcomer.call('me/measurements')).status, 401);
  t.diagnostic('Registration: invalid 400, created PATIENT 201, duplicate 409, login 200 and empty history');

  const patientIdentity = await patient.login('hadil.karous@smartcare.local', password);
  const staffIdentity = await staff.login('ali.benali@smartcare.local', password);
  assert.equal(patientIdentity.displayName, 'Hadil Karous');
  assert.equal(staffIdentity.displayName, 'Dr Ali Ben Ali');
  assert.equal((await staff.call('me/measurements')).status, 403);
  assert.equal((await patient.call(scope + '/alerts')).status, 403);
  assert.equal((await staff.call('patients/' + created.data.userId + '/measurements')).status, 403);
  assert.equal((await staff.call('patients/' + created.data.userId + '/alerts')).status, 403);
  const assigned = await staff.call('patients');
  assert.equal(assigned.status, 200);
  assert.deepEqual(assigned.data.patients.map(row => row.name).sort(), ['Hadil Karous', 'Nour Gaida', 'Nour Shili']);
  assert.equal(assigned.data.patients.find(row => row.id === hadilId).devices[0].deviceId, hadilDevice);
  assert.equal((await staff.call(scope + '/simulations', { deviceId: 'sc-test-nour-shili', scenario: 'normal' })).status, 403);
  assert.equal((await staff.call(scope + '/simulations', { deviceId: hadilDevice, scenario: 'all' })).status, 400);
  const baseline = await patient.call('me/measurements?patientId=sc-patient-nour-gaida');
  assert.equal(baseline.status, 200);
  assert.ok(baseline.data.measurements.some(row => row.heartRate === 75 && row.spo2 === 98));
  assert.ok(baseline.data.measurements.every(row => row.deviceId === hadilDevice));
  t.diagnostic('Independent patient and staff sessions, three assignments, scope restrictions and seed history verified');

  async function run(scenario, expected) {
    const started = await staff.call(scope + '/simulations', { deviceId: hadilDevice, scenario });
    assert.equal(started.status, 202, 'The scenario should start on the assigned test device');
    let seen = 0;
    const snapshot = await waitFor(async () => {
      const result = await staff.call(scope + '/simulations/' + started.data.id);
      assert.equal(result.status, 200);
      assert.notEqual(result.data.status, 'failed', result.data.message);
      assert.ok(result.data.measurements.length >= seen);
      seen = result.data.measurements.length;
      return result.data.status === 'completed' ? result.data : null;
    }, 65, 'The simulator did not reach the expected MongoDB count');
    assert.equal(snapshot.measurements.length, expected);
    const lookup = new Set((await patient.call('me/measurements')).data.measurements.map(row => row.acquiredAtUtc));
    assert.ok(snapshot.measurements.every(row => lookup.has(row.acquiredAtUtc)), 'Patient history must include the transmitted readings');
    t.diagnostic(scenario + ': ' + expected + ' persisted readings in simulation and patient history');
    return snapshot;
  }

  const normal = await run('normal', 15);
  assert.ok(normal.measurements.every(row => row.heartRate >= 72 && row.heartRate <= 78 && row.spo2 >= 97));
  assert.equal((await staff.call(scope + '/alerts')).data.alerts.filter(row => row.bootId === normal.id).length, 0);
  const spike = await run('spike', 26);
  assert.equal(spike.measurements.filter(row => row.heartRate === 180).length, 1);
  assert.equal((await staff.call(scope + '/alerts')).data.alerts.filter(row => row.bootId === spike.id).length, 0);
  const sustained = await run('sustained', 37);
  assert.equal(sustained.measurements.filter(row => row.heartRate === 125 && row.spo2 === 93).length, 12);
  const alert = await waitFor(async () => (await staff.call(scope + '/alerts')).data.alerts
    .find(row => row.bootId === sustained.id), 10, 'Expected a persisted sustained alert');
  assert.equal(alert.anomalyType, 'LOW_SPO2');
  assert.equal(alert.deviceId, hadilDevice);
  assert.equal(alert.source, 'rule-detector');
  assert.ok((await patient.call('me/alerts')).data.alerts.some(row => row.id === alert.id));
  assert.ok(!(await staff.call('patients/sc-patient-nour-shili/alerts')).data.alerts.some(row => row.id === alert.id));
  const ackPath = scope + '/alerts/' + alert.id + '/acknowledgements';
  assert.equal((await staff.call(ackPath, { note: '' })).status, 400);
  assert.equal((await patient.call(ackPath, { note: 'Patient cannot acknowledge' })).status, 403);
  assert.equal((await staff.call(ackPath, { note: 'Vérification de persistance' })).status, 200);
  const refreshed = (await staff.call(scope + '/alerts')).data.alerts.find(row => row.id === alert.id);
  assert.equal(refreshed.note, 'Vérification de persistance');
  assert.ok(refreshed.acknowledgedAt);
  assert.equal(refreshed.status, alert.status);
  assert.equal((await patient.call('me/alerts')).data.alerts.find(row => row.id === alert.id).note, undefined);
  t.diagnostic('sustained: one patient-scoped rule alert, acknowledgement persisted after a fresh read');
  await Promise.all([patient.logout(), staff.logout()]);
  assert.equal((await patient.call('me/measurements')).status, 401);
  assert.equal((await staff.call('patients')).status, 401);
});

test('live scenario: two sessions see the same readings, alert onset and invalid gap', {
  skip: !password ? 'Set SMARTCARE_SEED_PASSWORD for the connected WAR.' : false,
  timeout: 120000
}, async t => {
  const patient = client();
  const staff = client();
  const scope = 'patients/sc-patient-hadil';
  const deviceId = 'sc-test-hadil';
  t.after(() => Promise.allSettled([patient.logout(), staff.logout()]));
  await Promise.all([
    patient.login('hadil.karous@smartcare.local', password),
    staff.login('ali.benali@smartcare.local', password)
  ]);
  assert.equal((await staff.call('me/latest-simulation')).status, 403);
  assert.equal((await patient.call(scope + '/latest-simulation')).status, 403);

  async function observe(scenario, expected) {
    const started = await staff.call(scope + '/simulations', { deviceId, scenario });
    assert.equal(started.status, 202);
    const id = started.data.id;
    let sawPartial = false;
    let sawAlertWhileRunning = false;
    let sawSignalLoss = false;
    let alertArrivalSkew;
    const firstSeen = {};
    const final = await waitFor(async () => {
      const [myScenario, staffScenario, myAlerts, staffAlerts] = await Promise.all([
        patient.call('me/latest-simulation?patientId=sc-patient-nour-shili'),
        staff.call(scope + '/latest-simulation?deviceId=' + deviceId),
        patient.call('me/alerts?patientId=sc-patient-nour-shili'),
        staff.call(scope + '/alerts')
      ]);
      for (const response of [myScenario, staffScenario, myAlerts, staffAlerts]) assert.equal(response.status, 200);
      const p = myScenario.data.run;
      const s = staffScenario.data.run;
      assert.equal(p?.id, id);
      assert.equal(s?.id, id);
      assert.notEqual(p.status, 'failed', p.message);
      assert.notEqual(s.status, 'failed', s.message);
      const shared = Math.min(p.measurements.length, s.measurements.length);
      assert.deepEqual(p.measurements.slice(0, shared), s.measurements.slice(0, shared));
      if (shared > 0 && shared < expected) sawPartial = true;

      const pAlert = myAlerts.data.alerts.find(row => row.bootId === id);
      const sAlert = staffAlerts.data.alerts.find(row => row.bootId === id);
      if (pAlert) firstSeen.patient ??= Date.now();
      if (sAlert) firstSeen.staff ??= Date.now();
      if (pAlert && sAlert) {
        assert.equal(pAlert.id, sAlert.id);
        assert.equal(pAlert.startedAt, sAlert.startedAt);
        alertArrivalSkew = Math.abs(firstSeen.patient - firstSeen.staff);
        if (p.status === 'running' && s.status === 'running') sawAlertWhileRunning = true;
      }
      if (p.measurements.at(-1)?.quality === 'invalid' && p.status === 'running') {
        const markup = scenarioResult({ ...p, rows: normalizeMeasurements(p.measurements) }, { patient: true });
        assert.match(markup, /Signal du capteur indisponible/);
        sawSignalLoss = true;
      }
      return p.status === 'completed' && s.status === 'completed' ? { p, s, pAlert, sAlert } : null;
    }, 65, 'The scenario should complete in both sessions');
    assert.ok(sawPartial, 'Both views must see the readings grow during the run');
    assert.equal(final.p.measurements.length, expected);
    assert.deepEqual(final.p.measurements, final.s.measurements);
    return { ...final, sawAlertWhileRunning, sawSignalLoss, alertArrivalSkew };
  }

  const sustained = await observe('sustained', 37);
  assert.equal(sustained.p.measurements.filter(row => row.heartRate === 125 && row.spo2 === 93).length, 12);
  assert.ok(sustained.sawAlertWhileRunning, 'Both sessions should see the same alert before the run finishes');
  assert.equal(sustained.pAlert.startedAt, sustained.p.measurements[10].acquiredAtUtc);
  assert.ok(Date.parse(sustained.pAlert.confirmedAt) > Date.parse(sustained.pAlert.startedAt));
  assert.equal((await patient.call(scope + '/alerts/' + sustained.pAlert.id + '/acknowledgements', { note: 'Patient' })).status, 403);
  t.diagnostic('sustained: 37 identical timestamps and values; the alert appeared in both sessions during the run, polling difference ' +
    sustained.alertArrivalSkew + ' ms, start = first anomalous reading');

  const invalid = await observe('invalid', 18);
  assert.ok(invalid.sawSignalLoss, 'The signal status should change while the invalid readings are live');
  assert.equal(invalid.pAlert, undefined);
  assert.equal(invalid.sAlert, undefined);
  assert.equal(invalid.p.measurements.filter(row => row.quality === 'invalid' && row.heartRate === null && row.spo2 === null).length, 3);
  const plot = scenarioResult({ ...invalid.p, rows: normalizeMeasurements(invalid.p.measurements) }, { patient: true });
  assert.equal((plot.match(/<polyline /g) || []).length, 4);
  assert.match(plot, /Signal du capteur indisponible pendant le scénario\. Signal rétabli\./);

  const [freshPatientAlerts, freshStaffAlerts] = await Promise.all([patient.call('me/alerts'), staff.call(scope + '/alerts')]);
  const pAlert = freshPatientAlerts.data.alerts.find(row => row.id === sustained.pAlert.id);
  const sAlert = freshStaffAlerts.data.alerts.find(row => row.id === sustained.pAlert.id);
  assert.equal(pAlert.startedAt, sAlert.startedAt);
  assert.match(connectedAlerts([pAlert], { patient: true }), /Mesures inhabituelles à vérifier/);
  assert.doesNotMatch(connectedAlerts([pAlert], { patient: true }), /data-ack-alert/);
  t.diagnostic('invalid: 18 identical readings, three null samples, two segments per chart, signal warning and no new rule alert');
  t.diagnostic('The sustained alert remained in both fresh alert responses after invalid.');
});
