import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createDemoAuth, DEMO_ACCOUNTS } from '../shared/auth.mjs';
import { AccessError, chartSegments, filterReadings, paginate, readingsCSV, isStale } from '../shared/domain.mjs';
import { createPatientAdapter } from '../patient/adapter.mjs';
import { createSupervisionAdapter } from '../supervision/adapter.mjs';
import { administrativeFixtures } from '../supervision/fixtures/administrative.mjs';
import { clinicalFixtures } from '../supervision/fixtures/clinical.mjs';
import * as views from '../supervision/views.mjs';

const NOW = Date.UTC(2026, 10, 1, 12);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function workspace(role, options = {}) {
  const auth = createDemoAuth(['professional', 'administrator']);
  await auth.login(DEMO_ACCOUNTS[role]);
  return { auth, api: createSupervisionAdapter(auth, { now: () => NOW, ...options }) };
}

test('three explicit demo identities; fields, credentials and portal roles validated', async () => {
  for (const role of Object.keys(DEMO_ACCOUNTS)) {
    const auth = createDemoAuth([role]);
    assert.equal((await auth.login(DEMO_ACCOUNTS[role])).role, role);
    auth.logout(); assert.equal(auth.getSession(), null);
    await assert.rejects(auth.login({ email: 'bad', password: 'demo' }));
    await assert.rejects(auth.login({ email: DEMO_ACCOUNTS[role].email, password: 'wrong' }));
  }
  const patient = createDemoAuth(['patient']);
  await assert.rejects(patient.login(DEMO_ACCOUNTS.administrator));
});

test('professional has exactly three assigned patients and no unassigned alerts', async () => {
  const { api } = await workspace('professional');
  const patients = await api.getAssignedPatients();
  assert.deepEqual(patients.map(patient => patient.id), ['patient-001', 'patient-002', 'patient-003']);
  const alerts = await api.getAlerts();
  assert.ok(alerts.every(alert => alert.patientId !== 'patient-004'));
  assert.ok(patients.every(patient => patient.latest && 'quality' in patient.latest));
});

test('altered and unknown patient IDs fail before loading clinical fixtures', async () => {
  let loads = 0;
  const { api } = await workspace('professional', { loadClinical: async () => { loads++; return clinicalFixtures(NOW); } });
  for (const id of ['patient-004', 'patient-999', '../patient-001', '']) {
    await assert.rejects(api.getPatient(id), AccessError);
    await assert.rejects(api.getMeasurements(id), AccessError);
    await assert.rejects(api.getHistory(id), AccessError);
    await assert.rejects(api.getAlerts({ patientId: id || 'unknown' }), AccessError);
  }
  assert.equal(loads, 0);
});

test('administrator cannot use any clinical API; clinical loader is never called', async () => {
  let loads = 0;
  const { api } = await workspace('administrator', { loadClinical: async () => { loads++; return clinicalFixtures(NOW); } });
  for (const action of [
    () => api.getAssignedPatients(), () => api.getPatient('patient-001'),
    () => api.getMeasurements('patient-001'), () => api.getHistory('patient-001'),
    () => api.getAlerts(), () => api.acknowledgeAlert('alert-001', 'Review')
  ]) await assert.rejects(action(), AccessError);
  await api.getAccounts(); await api.getAssignments(); await api.getDevices();
  await api.getServices(); await api.getModel();
  assert.equal(loads, 0);
});

test('professional cannot use administrative APIs or mutations', async () => {
  const { api } = await workspace('professional');
  for (const action of [
    () => api.getAccounts(), () => api.createAccount({}), () => api.updateAccount('pro-001', {}),
    () => api.getAssignments(), () => api.assignPatient('patient-004', 'pro-001'),
    () => api.removeAssignment('patient-001', 'pro-001'), () => api.getDevices(),
    () => api.registerDevice({}), () => api.assignDevice('x', 'patient-001'),
    () => api.revokeDevice('x'), () => api.getServices(), () => api.getModel()
  ]) await assert.rejects(action(), AccessError);
});

test('acknowledgement records actor, note and time, without resolving the episode', async () => {
  const { api } = await workspace('professional');
  const before = (await api.getAssignedPatients()).find(patient => patient.id === 'patient-001');
  const alert = await api.acknowledgeAlert('alert-001', '  Reviewed demonstration values.  ');
  assert.equal(alert.state, 'acknowledged');
  assert.equal(alert.endedAt, null);
  assert.equal(alert.note, 'Reviewed demonstration values.');
  assert.equal(alert.acknowledgedById, 'pro-001');
  assert.equal(alert.acknowledgedBy, 'Dr Morgan Ellis');
  assert.equal(alert.acknowledgedAt, NOW);
  const after = (await api.getAssignedPatients()).find(patient => patient.id === 'patient-001');
  assert.equal(after.openAlerts, before.openAlerts);
  assert.equal(after.needsAcknowledgement, before.needsAcknowledgement - 1);
  assert.ok((await api.getAlerts({ state: 'acknowledged' })).some(item => item.id === alert.id));
});

test('acknowledgement rejects blank notes, oversized notes, repeats, resolved and unassigned alerts', async () => {
  const { api } = await workspace('professional');
  await assert.rejects(api.acknowledgeAlert('alert-001', ' '));
  await assert.rejects(api.acknowledgeAlert('alert-001', 'x'.repeat(501)));
  await assert.rejects(api.acknowledgeAlert('alert-003', 'Repeat'));
  await assert.rejects(api.acknowledgeAlert('alert-004', 'Already resolved'));
  await assert.rejects(api.acknowledgeAlert('alert-005', 'Unassigned'), AccessError);
  await assert.rejects(api.acknowledgeAlert('unknown', 'Unknown'), AccessError);
});

test('administrative fixtures and API responses contain no physiological or clinical fields', async () => {
  const { api } = await workspace('administrator');
  const values = [administrativeFixtures(NOW), await api.getAccounts(), await api.getDevices(),
    await api.getAssignments(), await api.getServices(), await api.getModel()];
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      assert.doesNotMatch(key, /^(hr|heartRate|spo2|measurements|readings|alerts|ruleVersion|reason)$/i);
      inspect(item);
    }
  }
  values.forEach(inspect);
  const html = [views.accountsView(await api.getAccounts()), views.assignmentsView(await api.getAssignments()),
    views.devicesView(await api.getDevices()), views.servicesView(await api.getServices()), views.modelView(await api.getModel())].join('');
  assert.doesNotMatch(html, /heart rate|blood oxygen|SpO₂|Export.*CSV|bpm/i);
});

test('account creation, duplicate validation, role changes and activation are functional', async () => {
  const { api } = await workspace('administrator');
  const created = await api.createAccount({ name: 'Demo User', email: 'new@smartcare.demo', role: 'professional' });
  assert.ok((await api.getAccounts()).some(account => account.id === created.id));
  await assert.rejects(api.createAccount({ name: 'Again', email: 'new@smartcare.demo', role: 'patient' }));
  await assert.rejects(api.createAccount({ name: 'Invalid', email: 'bad', role: 'patient' }));
  await api.updateAccount(created.id, { role: 'administrator', active: false });
  assert.deepEqual((await api.getAccounts()).find(account => account.id === created.id), { ...created, role: 'administrator', active: false });
  await api.updateAccount(created.id, { active: true });
  await assert.rejects(api.updateAccount(created.id, { role: 'owner' }));
  await assert.rejects(api.updateAccount('admin-001', { active: false }));
});

test('patient assignment, duplicate handling and removal work in memory', async () => {
  const { api } = await workspace('administrator');
  await api.assignPatient('patient-004', 'pro-001');
  assert.equal((await api.getAssignments()).assignments.length, 4);
  await assert.rejects(api.assignPatient('patient-004', 'pro-001'));
  await api.removeAssignment('patient-004', 'pro-001');
  assert.equal((await api.getAssignments()).assignments.length, 3);
  await api.updateAccount('pro-002', { active: false });
  await assert.rejects(api.assignPatient('patient-004', 'pro-002'));
});

test('device registration, assignment and revocation work; IDs and duplicate assignments validated', async () => {
  const { api } = await workspace('administrator');
  await api.registerDevice({ id: 'SC-TEST-004', label: 'Fictional device' });
  await assert.rejects(api.registerDevice({ id: 'SC-TEST-004', label: 'Duplicate' }));
  await assert.rejects(api.registerDevice({ id: '../bad', label: 'Invalid' }));
  await assert.rejects(api.assignDevice('SC-TEST-004', 'patient-001'));
  await api.assignDevice('SC-TEST-004', 'patient-004');
  assert.equal((await api.getDevices()).devices.find(device => device.id === 'SC-TEST-004').patientId, 'patient-004');
  await api.revokeDevice('SC-TEST-004');
  const device = (await api.getDevices()).devices.find(item => item.id === 'SC-TEST-004');
  assert.equal(device.status, 'revoked'); assert.equal(device.patientId, null);
  await assert.rejects(api.assignDevice(device.id, 'patient-004'));
});

test('empty, error, loading, unavailable and available demonstration states recover', async () => {
  const { api } = await workspace('administrator');
  api.setPreview('empty'); assert.deepEqual(await api.getAccounts(), []);
  api.setPreview('error'); await assert.rejects(api.getServices(), /Simulated service error/);
  api.setPreview('loading'); await assert.rejects(api.getServices(), error => error.code === 'LOADING');
  api.setPreview('unavailable'); assert.ok((await api.getServices()).every(service => !service.available));
  assert.equal((await api.getModel()).available, false);
  api.setPreview('available'); assert.equal((await api.getModel()).version, 'demo-model-v1');
  api.setPreview('normal'); assert.equal((await api.getAccounts()).length, 4);
  const pro = await workspace('professional');
  pro.api.setPreview('empty');
  assert.deepEqual(await pro.api.getAssignedPatients(), []);
  assert.deepEqual(await pro.api.getMeasurements('patient-001'), []);
  assert.deepEqual(await pro.api.getAlerts(), []);
});

test('history filters, pagination and CSV use the same selected readings', async () => {
  const { api } = await workspace('professional');
  const filters = { minutes: '15', quality: 'invalid', end: NOW };
  const selected = await api.getMeasurements('patient-001', filters);
  const history = await api.getHistory('patient-001', filters);
  assert.ok(selected.length > 0 && selected.every(reading => reading.hr === null));
  assert.equal(history.total, selected.length);
  assert.deepEqual(history.rows, [...selected].reverse());
  const csv = readingsCSV(selected);
  assert.equal(csv.split('\r\n').length, selected.length + 1);
  assert.doesNotMatch(csv, /null|undefined/);
  assert.equal(paginate(Array.from({ length: 25 }, (_, i) => i), 2).rows[0], 10);
  assert.equal(paginate([], 500).page, 1);
  assert.equal(filterReadings(selected, { minutes: 'all', quality: 'good', end: NOW }).length, 0);
});

test('chart paths break for invalid readings and missing timestamps; stale boundary is 30 seconds', () => {
  const sample = (timestamp, hr = 75) => ({ timestamp, hr, quality: hr === null ? 'invalid' : 'good' });
  const parts = chartSegments([sample(0), sample(1000), sample(2000, null), sample(3000), sample(10000)], 'hr');
  assert.deepEqual(parts.map(part => part.length), [2, 1, 1]);
  assert.equal(isStale(NOW - 29999, NOW), false);
  assert.equal(isStale(NOW - 30000, NOW), true);
  assert.equal(isStale(null, NOW), true);
});

test('patient session starts with invalid and missing samples and clears all data on logout', async () => {
  const api = createPatientAdapter(() => NOW);
  await assert.rejects(api.login(DEMO_ACCOUNTS.administrator));
  await api.login(DEMO_ACCOUNTS.patient);
  const rows = api.getReadings();
  const alerts = api.getAlerts();
  assert.ok(chartSegments(rows, 'hr').length >= 3);
  assert.equal(api.nextReading(false).reason, 'no_finger');
  assert.equal(api.getDevice().patientId, 'patient-001');
  api.previewAlert(); assert.equal(alerts.length, 1);
  api.logout();
  assert.equal(api.getSession(), null); assert.equal(rows.length, 0); assert.equal(alerts.length, 0);
  assert.throws(() => api.getReadings(), AccessError);
  await api.login(DEMO_ACCOUNTS.patient); assert.equal(api.getAlerts().length, 0);
});

test('supervision logout revokes reads and mutations; a fresh session resets changes', async () => {
  const { auth, api } = await workspace('professional');
  await api.acknowledgeAlert('alert-001', 'Reviewed');
  api.logout();
  await assert.rejects(api.getPatient('patient-001'), AccessError);
  await assert.rejects(api.getAccounts(), AccessError);
  await auth.login(DEMO_ACCOUNTS.professional);
  await assert.rejects(api.getAlerts(), AccessError);
  const fresh = createSupervisionAdapter(auth, { now: () => NOW });
  assert.equal((await fresh.getAlerts()).find(alert => alert.id === 'alert-001').state, 'open');
});

test('a pending clinical load cannot return data after logout', async () => {
  let release;
  const { api } = await workspace('professional', {
    loadClinical: () => new Promise(resolve => { release = resolve; })
  });
  const pending = api.getPatient('patient-001');
  api.logout();
  release(clinicalFixtures(NOW));
  await assert.rejects(pending, AccessError);
});

test('HTML escapes account names and acknowledgement notes', async () => {
  const { api } = await workspace('professional');
  const alert = await api.acknowledgeAlert('alert-001', '<img src=x onerror=alert(1)>');
  const html = views.alertView(alert);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(views.accountsView([{ id: 'safe', name: '<script>', email: 'a@b.c', role: 'patient', active: true }]).includes('&lt;script&gt;'));
});

test('patient search, state filters and empty views are functional', async () => {
  const { api } = await workspace('professional', { now: () => Date.now() });
  const patients = await api.getAssignedPatients();
  assert.ok(views.patientCards(patients, 'jamie').includes('Jamie Davis'));
  assert.ok(!views.patientCards(patients, 'jamie').includes('Alex Morgan'));
  assert.ok(views.patientCards(patients, 'SC-002').includes('Alex Morgan'));
  assert.ok(!views.patientCards(patients, '', 'connected').includes('Alex Morgan'));
  assert.ok(views.patientCards(patients, '', 'invalid').includes('Sam Taylor'));
  assert.match(views.patientCards(patients, 'not found'), /No assigned patients/);
  assert.match(views.alertsTable([]), /No alerts/);
});

test('professional detail and alert list views render the selected data and pagination controls', async () => {
  const { api } = await workspace('professional');
  const filters = { minutes: '15', quality: 'all', metric: 'hr', page: 2, end: NOW };
  const patient = await api.getPatient('patient-001');
  const rows = await api.getMeasurements(patient.id, filters);
  const history = await api.getHistory(patient.id, filters, 2);
  const alerts = await api.getAlerts({ patientId: patient.id });
  const html = views.patientView(patient, rows, history, alerts, filters);
  assert.match(html, /Export selected CSV/);
  assert.match(html, /Page 2 of/);
  assert.match(html, /class="clinical-chart"/);
  assert.match(html, /data-page="1"/);
  assert.ok(html.includes('href="#alert/alert-001"'));
  const list = views.alertsView(alerts, await api.getAssignedPatients(), { patientId: patient.id, state: 'all' });
  assert.match(list, /Jamie Davis/);
  assert.match(list, /name="patientId"/);
});

function worker(app) {
  const listeners = {};
  const writes = [];
  const cached = new Map();
  const cache = { addAll: async urls => { writes.push(...urls); },
    put: async (key, value) => { cached.set(key, value); },
    match: async key => cached.get(key) };
  const context = { URL, self: { registration: { scope: 'https://demo.test/frontend/' + app + '/' },
    addEventListener: (type, handler) => { listeners[type] = handler; },
    skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => new Response('static') };
  vm.runInNewContext(readFileSync(resolve(root, app, 'sw.js'), 'utf8'), context);
  return { listeners, writes, cached, context };
}

test('both manifests, icons, HTML/CSS references and module imports resolve to static files', () => {
  const identities = new Set(), starts = new Set(), icons = new Set();
  for (const filename of readdirSync(root, { recursive: true }).filter(file => /\.(js|mjs)$/.test(file))) {
    const source = readFileSync(resolve(root, filename), 'utf8');
    for (const match of source.matchAll(/\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      assert.ok(existsSync(resolve(dirname(resolve(root, filename)), match[1])), filename + ': ' + match[1]);
    }
  }
  for (const app of ['patient', 'supervision']) {
    const manifest = JSON.parse(readFileSync(resolve(root, app, 'manifest.webmanifest')));
    const base = new URL('https://demo.test/frontend/' + app + '/manifest.webmanifest');
    identities.add(new URL(manifest.id, base).href);
    starts.add(new URL(manifest.start_url, base).href);
    icons.add(new URL(manifest.icons[0].src, base).href);
    assert.equal(manifest.scope, './');
    for (const icon of manifest.icons) {
      const png = readFileSync(resolve(root, app, icon.src));
      assert.equal(png.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
      assert.equal(png.readUInt32BE(20), Number(icon.sizes.split('x')[1]));
    }
    const html = readFileSync(resolve(root, app, 'index.html'), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\.[^"#]+)"/g)) {
      assert.ok(existsSync(resolve(root, app, match[1])), app + ': ' + match[1]);
    }
    assert.match(html, /name="viewport"/);
    assert.match(html, /type="email"/);
    assert.match(html, /type="password"/);
    assert.match(html, /id="connectivity-notice"/);
  }
  assert.equal(identities.size, 2, 'Each PWA needs its own resolved identity.');
  assert.equal(starts.size, 2, 'Launch URLs must be distinct.');
  assert.equal(icons.size, 2, 'Each PWA must own its icon URL.');
  assert.notDeepEqual(readFileSync(resolve(root, 'patient/icon-192.png')),
    readFileSync(resolve(root, 'supervision/icon-192.png')), 'Install icons must be visually distinguishable.');
});

test('service workers cache distinct static resources, handle root offline and ignore API, query and non-GET requests', async () => {
  const sources = ['patient', 'supervision'].map(app => readFileSync(resolve(root, app, 'sw.js'), 'utf8'));
  assert.ok(sources[0].includes('smartcare-patient-static-'));
  assert.ok(sources[1].includes('smartcare-supervision-static-'));
  assert.ok(!sources[1].includes("startsWith('smartcare-patient"));
  for (const app of ['patient', 'supervision']) {
    const runtime = worker(app);
    let installation;
    runtime.listeners.install({ waitUntil: promise => { installation = promise; } });
    await installation;
    for (const url of runtime.writes) {
      assert.match(url, /\.(html|css|js|mjs|png|svg|webmanifest)$/);
      const relative = new URL(url).pathname.replace('/frontend/', '');
      assert.ok(existsSync(resolve(root, relative)), relative);
    }
    for (const url of [
      'https://demo.test/api/readings', 'https://demo.test/api/health/database',
      'https://demo.test/smartcare/api/me/measurements', 'https://demo.test/smartcare/api/me/alerts',
      'https://demo.test/smartcare/api/patients/patient-001/measurements/export',
      'https://demo.test/frontend/' + app + '/history.json',
      'https://demo.test/frontend/' + app + '/export.csv',
      'https://demo.test/frontend/' + app + '/app.js?token=demo'
    ]) {
      runtime.listeners.fetch({ request: { method: 'GET', url }, respondWith: () => assert.fail('Must not cache API or query requests') });
    }
    runtime.listeners.fetch({ request: { method: 'POST', url: 'https://demo.test/api/login' },
      respondWith: () => assert.fail('Must not cache POST') });
    let response;
    runtime.listeners.fetch({ request: { method: 'GET', url: 'https://demo.test/frontend/' + app + '/' },
      respondWith: promise => { response = promise; } });
    assert.equal((await response).status, 200);
    runtime.context.fetch = async () => { throw new Error('offline'); };
    runtime.listeners.fetch({ request: { method: 'GET', url: 'https://demo.test/frontend/' + app + '/' },
      respondWith: promise => { response = promise; } });
    assert.equal((await response).status, 200);
  }
});

test('production frontend does not persist sessions, readings or alerts in browser storage', () => {
  for (const folder of ['shared', 'patient', 'supervision']) {
    for (const filename of readdirSync(resolve(root, folder), { recursive: true }).filter(file => /\.(js|mjs)$/.test(file))) {
      const source = readFileSync(resolve(root, folder, filename), 'utf8');
      assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB)\b/, filename);
      if (!filename.endsWith('sw.js')) assert.doesNotMatch(source, /\bcaches\s*\./, filename);
    }
  }
});
