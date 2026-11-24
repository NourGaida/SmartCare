import assert from 'node:assert/strict';
import test from 'node:test';
import { createCareApi } from '../shared/care-api.mjs';
import { createServerAuth } from '../shared/server-auth.mjs';
import { connectedAlerts } from '../shared/connected-views.mjs';
import { simulationControls, simulationResult } from '../backoffice/simulation-view.mjs';
import { pollCare } from '../shared/poll-care.mjs';
import { scenarioResult } from '../shared/scenario-view.mjs';

const base = new URL('http://localhost:8085/smartcare/api/');

test('patient registration sends only the user fields and reports conflicts', async () => {
  const calls = [];
  const auth = createServerAuth(base, async (url, request) => {
    calls.push([url.pathname, request]);
    if (calls.length === 1) return Response.json({ role: 'PATIENT' }, { status: 201 });
    return Response.json({ message: 'This email is already registered.' }, { status: 409 });
  });
  const fields = { name: ' Test patient ', email: ' patient@smartcare.invalid ', password: 'test-only-password', role: 'ADMIN' };
  await auth.signUp(fields);
  assert.equal(calls[0][0], '/smartcare/api/auth/signup');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0][1].body), { name: 'Test patient', email: 'patient@smartcare.invalid', password: fields.password });
  await assert.rejects(auth.signUp(fields), /already registered/);
});

test('care API uses same-origin no-store, CSRF for mutations and empty lists as data', async () => {
  const calls = [];
  const api = createCareApi(base, { csrfToken: 'local-test' }, async (url, request) => {
    calls.push([url.pathname, request]);
    return Response.json(url.pathname.endsWith('patients') ? { patients: [] } : { id: 'run-1' });
  });
  assert.deepEqual(await api.assignedPatients(), []);
  assert.equal((await api.startSimulation('p 1', 'sc-1', 'normal')).id, 'run-1');
  const [path, request] = calls.at(-1);
  assert.equal(path, '/smartcare/api/patients/p%201/simulations');
  assert.equal(request.headers['X-CSRF-Token'], 'local-test');
  assert.equal(request.credentials, 'same-origin');
  assert.equal(request.cache, 'no-store');
  assert.deepEqual(JSON.parse(request.body), { deviceId: 'sc-1', scenario: 'normal' });
});

test('a lost session is distinguished from a retryable outage or invalid JSON envelope', async () => {
  const replies = [
    new Response('', { status: 401 }),
    Response.json({ message: 'Workspace unavailable' }, { status: 503 }),
    Response.json({})
  ];
  const api = createCareApi(base, {}, async () => replies.shift());
  await assert.rejects(api.assignedPatients(), { code: 'SESSION_EXPIRED' });
  await assert.rejects(api.assignedPatients(), /Workspace unavailable/);
  await assert.rejects(api.assignedPatients(), /invalid list/);
});

test('the simulation displays the selected eligible device and only plots returned measurements', () => {
  const patients = [{ id: 'p1', name: 'Hadil Karous', devices: [
    { deviceId: 'sc-enabled', simulationEnabled: true }, { deviceId: 'sc-disabled', simulationEnabled: false }
  ] }];
  const controls = simulationControls(patients, { selectedDevice: 'sc-enabled', running: true });
  assert.match(controls, /MAX30102/);
  assert.match(controls, /sc-enabled/);
  assert.doesNotMatch(controls, /sc-disabled/);
  assert.match(controls, /data-scenario="sustained" disabled/);
  const pending = simulationResult({ deviceId: 'sc-enabled', scenario: 'normal', status: 'running', rows: [], expected: 15 });
  assert.match(pending, /0 \/ 15 saved readings/);
  assert.doesNotMatch(pending, /<svg/);
  const now = Date.UTC(2026, 10, 23, 12);
  const rows = [
    { timestamp: now, hr: 73, spo2: 97, quality: 'good' },
    { timestamp: now + 1000, hr: 75, spo2: 98, quality: 'good' }
  ];
  const active = simulationResult({ deviceId: 'sc-enabled', scenario: 'normal', status: 'running', rows, expected: 15 });
  assert.match(active, /2 \/ 15 saved readings/);
  assert.match(active, /75 bpm/);
  assert.match(active, /98 %/);
  assert.equal((active.match(/<polyline/g) || []).length, 2);
});

test('a rule alert presents acknowledgment independently from resolution and hides patient mutation', () => {
  assert.match(connectedAlerts([]), /No rule alerts/);
  const entry = { id: 'episode-1', deviceId: 'sc-1', anomalyType: 'LOW_SPO2',
    status: 'resolved', confirmedAt: '2026-11-23T12:00:00Z' };
  assert.match(connectedAlerts([entry], { acknowledge: true }), /Resolved · Awaiting acknowledgement/);
  assert.match(connectedAlerts([entry], { acknowledge: true }), /data-ack-alert="episode-1"/);
  assert.doesNotMatch(connectedAlerts([entry]), /<form/);
  const acknowledged = connectedAlerts([{ ...entry, acknowledgedAt: '2026-11-23T12:01:00Z', note: '<Reviewed>' }],
    { acknowledge: true });
  assert.match(acknowledged, /Resolved · Acknowledged/);
  assert.match(acknowledged, /&lt;Reviewed&gt;/);
  assert.doesNotMatch(acknowledged, /<form/);
});

test('patient scenario charts share second-level ticks and leave a gap for invalid samples', () => {
  const timestamp = Date.UTC(2026, 10, 24, 12);
  const rows = Array.from({ length: 7 }, (_, index) => {
    const invalid = index > 1 && index < 5;
    return { timestamp: timestamp + index * 1000, quality: invalid ? 'invalid' : 'good',
      hr: invalid ? null : 75, spo2: invalid ? null : 98 };
  });
  const markup = scenarioResult({ deviceId: 'sc-test-hadil', scenario: 'invalid', rows, status: 'completed', expected: 7 },
    { patient: true });
  const charts = [...markup.matchAll(/<svg[^>]*data-range-start="(\d+)" data-range-end="(\d+)"[\s\S]*?<\/svg>/g)];
  assert.equal(charts.length, 2);
  assert.deepEqual(charts[0].slice(1), charts[1].slice(1));
  const ticks = svg => [...svg.matchAll(/class="chart-time"[^>]*>([\d:]+)<\/text>/g)].map(match => match[1]);
  assert.equal(ticks(charts[0][0]).length, 3);
  assert.deepEqual(ticks(charts[0][0]), ticks(charts[1][0]));
  for (const tick of ticks(charts[0][0])) assert.match(tick, /^\d{2}:\d{2}:\d{2}$/);
  for (const chart of charts) assert.equal((chart[0].match(/<polyline /g) || []).length, 2);
  assert.match(markup, /Signal du capteur indisponible/);
  assert.match(markup, /<td>—<\/td><td>—<\/td><td>Indisponible/);
});

test('patient alert uses onset and keeps practitioner controls and notes out', () => {
  const startedAt = '2026-11-24T12:00:10Z';
  const markup = connectedAlerts([{ id: 'alert-1', anomalyType: 'LOW_SPO2', startedAt,
    confirmedAt: '2026-11-24T12:00:20Z', note: 'Professional note' }], { patient: true, acknowledge: true });
  assert.match(markup, /Mesures inhabituelles à vérifier/);
  assert.ok(markup.includes('Début <time datetime="' + startedAt + '"'));
  assert.doesNotMatch(markup, /Professional note|data-ack-alert|12:00:20Z/);
});

test('live polling refreshes the view and stops when the user leaves', async () => {
  const controller = new AbortController();
  const shown = [];
  let calls = 0;
  await new Promise((resolve, reject) => {
    pollCare(controller.signal, async () => ++calls, value => {
      shown.push(value);
      if (value === 2) {
        controller.abort();
        resolve();
      }
    }, reject, 1);
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(shown, [1, 2]);
  assert.equal(calls, 2);
});
