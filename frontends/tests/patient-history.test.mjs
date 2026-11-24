// Mocked HTTP responses against the actual frontend adapter/state model, not server integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMeasurementsAdapter, normalizeMeasurements, MeasurementHistoryError } from '../frontoffice/measurements-adapter.mjs';
import { createHistoryModel, historyStatus, selectHistoryRows, mountHistory } from '../frontoffice/history.mjs';
import { mountServerHistory } from '../frontoffice/server-history.mjs';
import { createServerAuth } from '../shared/server-auth.mjs';
import { mountServerPortal } from '../shared/server-portal.mjs';
import { chartMarkup } from '../shared/ui.mjs';
import { readingsCSV } from '../shared/domain.mjs';

const sample = JSON.parse(readFileSync(new URL('../frontoffice/fixtures/measurement-history.json', import.meta.url), 'utf8'));
const base = new URL('https://smartcare.test/smartcare/api/');
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' }
});
const adapterFor = request => createMeasurementsAdapter({ apiBaseUrl: base, request });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('history GET uses the existing same-origin session cookie and never sends a client patient identifier', async () => {
  const calls = [];
  const adapter = adapterFor(async (url, options) => { calls.push({ url, options }); return json(sample); });
  const result = await adapter.getMeasurements({ patientId: 'another-patient', userId: 'forged' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, 'https://smartcare.test/smartcare/api/me/measurements');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(calls[0].options.headers, { Accept: 'application/json' });
  assert.equal(calls[0].options.body, undefined);
  assert.equal(result.origin, 'server');
});

test('the same example JSON is fetched for demo and explicitly labelled fictional', async () => {
  let target;
  const adapter = createMeasurementsAdapter({ mode: 'demo', request: async (url, options) => {
    target = url;
    assert.ok(url.pathname.endsWith('/frontoffice/fixtures/measurement-history.json'));
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    return json(sample);
  } });
  const result = await adapter.getMeasurements();
  assert.ok(!target.pathname.includes('/api/'));
  assert.equal(result.rows.length, sample.measurements.length);
  assert.equal(result.origin, 'demo');
  assert.match(historyStatus({ status: 'ready', origin: result.origin }).originLabel, /FICTIONAL DEMO/);
});

test('conversion sorts a shuffled response chronologically and preserves bpm, percent and invalid nulls', () => {
  const original = JSON.stringify(sample);
  const rows = normalizeMeasurements(sample);
  assert.equal(JSON.stringify(sample), original, 'Conversion must not mutate the response.');
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(row => row.timestamp), [...rows].map(row => row.timestamp).sort((a, b) => a - b));
  assert.equal(rows[0].hr, 75);
  assert.equal(rows[0].spo2, 98);
  assert.equal(rows[2].quality, 'invalid');
  assert.equal(rows[2].hr, null);
  assert.equal(rows[2].spo2, null);
  assert.equal(rows[2].reason, 'no_finger');
  assert.deepEqual(normalizeMeasurements(sample.measurements), rows);
});

test('both shared charts have chronological segments, units and gaps instead of interpolated invalid values', () => {
  const rows = normalizeMeasurements(sample);
  for (const metric of ['hr', 'spo2']) {
    const svg = chartMarkup(rows, metric, rows[5].timestamp + 1000, 14 / 60);
    assert.match(svg, metric === 'hr' ? /bpm/ : /percent/);
    const parts = [...svg.matchAll(/points="([^"]+)"/g)];
    assert.equal(parts.length, 2);
    for (const part of parts) {
      const x = part[1].split(' ').map(point => Number(point.split(',')[0]));
      assert.deepEqual(x, [...x].sort((a, b) => a - b));
    }
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});

for (const payload of [[], { measurements: [] }]) {
  test('an empty server list is an empty history, never demo data: ' + JSON.stringify(payload), async () => {
    const model = createHistoryModel(adapterFor(async () => json(payload)));
    await model.load();
    assert.equal(model.getState().status, 'empty');
    assert.deepEqual(model.getState().rows, []);
    assert.equal(historyStatus(model.getState()).showContent, false);
    assert.match(historyStatus(model.getState()).message, /No measurements/);
    assert.match(historyStatus(model.getState()).originLabel, /saved to your account/);
  });
}

test('loading is visible while the request is pending, before the data is available', async () => {
  const response = deferred();
  const transitions = [];
  const model = createHistoryModel(adapterFor(() => response.promise), {
    onChange: state => transitions.push(state.status)
  });
  const pending = model.load();
  assert.equal(model.getState().status, 'loading');
  assert.equal(historyStatus(model.getState()).showContent, false);
  assert.match(historyStatus(model.getState()).message, /Loading measurements/);
  response.resolve(json(sample));
  await pending;
  assert.deepEqual(transitions, ['loading', 'ready']);
  assert.equal(historyStatus(model.getState()).showContent, true);
});

for (const status of [400, 403, 404, 500, 503]) {
  test('HTTP ' + status + ' shows an unavailable state with retry and no fictional fallback', async () => {
    const urls = [];
    let expired = false;
    const model = createHistoryModel(adapterFor(async url => {
      urls.push(url.href); return json({ error: 'unavailable' }, status);
    }), { onSessionExpired: () => { expired = true; } });
    await model.load();
    assert.equal(model.getState().status, 'error');
    assert.deepEqual(model.getState().rows, []);
    assert.match(model.getState().error, new RegExp('HTTP ' + status));
    assert.equal(historyStatus(model.getState()).canRetry, true);
    assert.deepEqual(urls, ['https://smartcare.test/smartcare/api/me/measurements']);
    assert.equal(expired, false);
  });
}

test('a network error can be retried successfully', async () => {
  let calls = 0;
  const model = createHistoryModel(adapterFor(async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return json(sample);
  }));
  await model.load();
  assert.equal(model.getState().status, 'error');
  assert.match(model.getState().error, /Check your connection/);
  assert.equal(historyStatus(model.getState()).canRetry, true);
  await model.load();
  assert.equal(model.getState().status, 'ready');
  assert.equal(model.getState().error, '');
  assert.equal(calls, 2);
});

test('server login/session contract is followed by history; a history 401 requests a return to login', async () => {
  const calls = [];
  const responses = [
    json({}), json({ userId: 'patient-server', role: 'PATIENT', csrfToken: 'test-csrf' }),
    json({ error: 'unauthorized' }, 401)
  ];
  const request = async (url, options) => { calls.push({ url, options }); return responses.shift(); };
  const auth = createServerAuth(base, request);
  const session = await auth.signIn({ email: 'fictional@example.test', password: 'test-only' }, ['patient']);
  assert.equal(session.role, 'patient');
  let loginMessage;
  const model = createHistoryModel(adapterFor(request), {
    onSessionExpired: message => { loginMessage = message; }
  });
  await model.load();
  assert.equal(model.getState().status, 'expired');
  assert.deepEqual(model.getState().rows, []);
  assert.match(loginMessage, /session has expired/);
  assert.deepEqual(calls.map(call => call.url.pathname), [
    '/smartcare/api/auth/login', '/smartcare/api/session', '/smartcare/api/me/measurements'
  ]);
  assert.ok(calls.every(call => call.options.credentials === 'same-origin'));
});

test('previous health data is cleared on reload and cannot survive an error', async () => {
  let calls = 0;
  const model = createHistoryModel(adapterFor(async () => ++calls === 1 ? json(sample) : json({}, 503)));
  await model.load();
  assert.equal(model.getState().rows.length, 6);
  const pending = model.load();
  assert.equal(model.getState().rows.length, 0);
  await pending;
  assert.equal(model.getState().rows.length, 0);
  assert.equal(model.getState().status, 'error');
});

test('logout aborts a pending request and prevents a late response from repopulating history', async () => {
  const response = deferred();
  let signal;
  const model = createHistoryModel(adapterFor((_, options) => { signal = options.signal; return response.promise; }));
  const pending = model.load();
  model.reset();
  assert.equal(signal.aborted, true);
  response.resolve(json(sample));
  await pending;
  assert.equal(model.getState().status, 'idle');
  assert.deepEqual(model.getState().rows, []);
});

test('a stale 401 response cannot close a newer load/session', async () => {
  const first = deferred();
  let calls = 0, expirations = 0;
  const model = createHistoryModel(adapterFor(() => ++calls === 1 ? first.promise : Promise.resolve(json(sample))), {
    onSessionExpired: () => { expirations++; }
  });
  const old = model.load();
  await model.load();
  first.resolve(json({}, 401));
  await old;
  assert.equal(model.getState().status, 'ready');
  assert.equal(expirations, 0);
});

test('invalid JSON and unsupported DTOs produce an error, never an empty or partially rendered history', async () => {
  for (const response of [new Response('<html>not JSON</html>'), json({ items: [] }), json(null),
    json({ measurements: [sample.measurements[0], { acquiredAtUtc: 'bad' }] })]) {
    const model = createHistoryModel(adapterFor(async () => response));
    await model.load();
    assert.equal(model.getState().status, 'error');
    assert.deepEqual(model.getState().rows, []);
    assert.equal(historyStatus(model.getState()).canRetry, true);
  }
});

test('conversion rejects ambiguous dates, text values, missing valid numbers and unknown qualities', () => {
  for (const override of [
    { acquiredAtUtc: '2026-11-17T12:00:00' }, { heartRate: '75' },
    { heartRate: null }, { spo2: '98' }, { quality: 'unexpected' }
  ]) assert.throws(() => normalizeMeasurements([{ ...sample.measurements[0], ...override }]), MeasurementHistoryError);
});

test('filtered history and CSV remain consistent and retain chronological dates', () => {
  const rows = normalizeMeasurements(sample);
  const selected = selectHistoryRows(rows, { range: 'all', quality: 'invalid' });
  assert.equal(selected.length, 1);
  const csv = readingsCSV(selected);
  assert.match(csv, /"2026-11-17T12:00:02.000Z"/);
  assert.match(csv, /"","","invalid","simulated"/);
  assert.equal(csv.split('\r\n').length, 2);
  assert.deepEqual(selectHistoryRows(rows, { range: '15', end: Date.parse('2026-11-18T12:00:00Z') }), []);
});

// Minimal DOM boundary for controller tests, built from the real history markup.
// This checks rendering/events without claiming browser or visual verification.
function historyRoot() {
  class Node {
    constructor() { this.dataset = {}; this.attributes = {}; this.handlers = new Map(); this.value = ''; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) {
      if (!this.handlers.has(name)) this.handlers.set(name, new Set());
      this.handlers.get(name).add(callback);
    }
    removeEventListener(name, callback) { this.handlers.get(name)?.delete(callback); }
    async emit(name) { await Promise.all([...this.handlers.get(name) || []].map(callback => callback())); }
  }
  const html = readFileSync(new URL('../frontoffice/index.html', import.meta.url), 'utf8');
  const markup = html.slice(html.indexOf('<section id="view-history"'), html.indexOf('<section id="view-alerts"'));
  const nodes = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match => ['#' + match[1], new Node()]));
  for (const selector of ['[data-export]', '[data-history-chart="hr"]', '[data-history-chart="spo2"]']) {
    assert.ok(markup.includes(selector.slice(1, -1)));
    nodes.set(selector, new Node());
  }
  nodes.get('#history-range').value = 'all'; nodes.get('#history-quality').value = 'all';
  const element = new Node();
  element.querySelector = selector => nodes.get(selector) || null;
  return { element, get: selector => nodes.get(selector) };
}

test('history controller renders loading, the two charts and filtered rows from the real markup', async () => {
  const response = deferred();
  const root = historyRoot();
  const controller = mountHistory(root.element, { adapter: adapterFor(() => response.promise) });
  const pending = controller.load();
  assert.equal(root.element.dataset.historyState, 'loading');
  assert.equal(root.get('#history-content').hidden, true);
  assert.match(root.get('#history-message').textContent, /Loading/);
  response.resolve(json(sample)); await pending;
  assert.equal(root.element.dataset.historyState, 'ready');
  assert.equal(root.get('#history-content').hidden, false);
  assert.equal(root.get('[data-export]').disabled, false);
  for (const metric of ['hr', 'spo2']) assert.match(root.get('[data-history-chart="' + metric + '"]').innerHTML, /<svg/);
  root.get('#history-quality').value = 'invalid';
  await root.get('#history-quality').emit('change');
  assert.match(root.get('#history-total').textContent, /^1 selected/);
  assert.match(root.get('#history-body').innerHTML, /Invalid signal/);
  controller.dispose();
  assert.equal(root.get('[data-history-chart="hr"]').innerHTML, '');
});

test('the actual Retry binding reloads an HTTP error and displays a returned empty list', async () => {
  let calls = 0;
  const root = historyRoot();
  const controller = mountHistory(root.element, {
    adapter: adapterFor(async () => ++calls === 1 ? json({}, 503) : json([]))
  });
  await controller.load();
  assert.equal(root.element.dataset.historyState, 'error');
  assert.equal(root.get('#history-retry').hidden, false);
  assert.equal(root.get('[data-export]').disabled, true);
  await root.get('#history-retry').emit('click');
  assert.equal(root.element.dataset.historyState, 'empty');
  assert.match(root.get('#history-message').textContent, /No measurements/);
  assert.equal(root.get('#history-retry').hidden, true);
  assert.equal(root.get('#history-content').hidden, true);
  assert.equal(calls, 2);
  controller.dispose();
});

test('history controller clears health content on expiry and removes retry handlers on disposal', async () => {
  let expired = 0, calls = 0;
  const root = historyRoot();
  const controller = mountHistory(root.element, {
    adapter: adapterFor(async () => ++calls === 1 ? json(sample) : json({}, 401)),
    onSessionExpired: () => { expired++; }
  });
  await controller.load(); await controller.load();
  assert.equal(expired, 1);
  assert.equal(root.element.dataset.historyState, 'expired');
  assert.equal(root.get('[data-history-chart="hr"]').innerHTML, '');
  assert.equal(root.get('#history-content').hidden, true);
  controller.dispose();
  await root.get('#history-refresh').emit('click');
  assert.equal(calls, 2);
});

test('the server patient history mount refuses other roles before touching the DOM', () => {
  for (const role of ['professional', 'administrator']) {
    assert.throws(() => mountServerHistory({ session: { role } }), /patient session/);
  }
});

// Minimal DOM boundary for the actual shared login controller, not a browser.
async function withLoginDocument(run) {
  class Element {
    constructor() { this.hidden = false; this.textContent = ''; this.handlers = new Map(); this.firstChild = {}; }
    setAttribute(name, value) { this[name] = value; }
    append() {}
    focus() {}
    addEventListener(type, callback) { this.handlers.set(type, callback); }
    async emit(type) { await this.handlers.get(type)?.({ preventDefault() {} }); }
  }
  const welcome = new Element(), intro = new Element(), message = new Element();
  const heading = new Element(), demo = new Element(), submit = new Element();
  const email = new Element(), password = new Element();
  password.labels = [{ firstChild: {} }];
  const form = new Element();
  form.elements = { namedItem: name => name === 'password' ? password : email };
  form.querySelector = () => message;
  form.reset = () => {};
  const card = new Element();
  card.querySelector = selector => ({ p: intro, h1: heading, '.demo-access': demo })[selector] || null;
  card.closest = () => welcome;
  const skip = new Element();
  const doc = {
    createElement: () => new Element(),
    querySelector: selector => ({ '.welcome-card': card, '#login-form': form,
      '#login-submit': submit, '.skip-link': skip })[selector]
  };
  const original = { document: globalThis.document, window: globalThis.window, FormData: globalThis.FormData };
  globalThis.document = doc;
  globalThis.window = { history: { replaceState() {} } };
  globalThis.FormData = class { *[Symbol.iterator]() { yield ['email', 'patient@example.test']; yield ['password', 'fictional']; } };
  try { await run({ card, form, message, heading, submit }); }
  finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}

test('the patient HTML has a dedicated entry that explicitly selects the patient portal', () => {
  const html = readFileSync(new URL('../frontoffice/index.html', import.meta.url), 'utf8');
  assert.match(html, /src="\.\/portal\.mjs" data-portal="frontoffice"/);
  const entry = readFileSync(new URL('../frontoffice/portal.mjs', import.meta.url), 'utf8');
  assert.match(entry, /mountServerPortal\('frontoffice'\)/);
  assert.match(entry, /updateViaCache: 'none'/);
});

test('a restored patient session mounts History and never renders the supervision session card', async () => {
  await withLoginDocument(async ({ heading, submit }) => {
    const session = { userId: 'dev-patient-1', role: 'patient', csrfToken: 'test-csrf' };
    let mounted;
    const controller = mountServerPortal('frontoffice', {
      auth: { readSession: async () => session },
      loadPatientHistory: async () => ({ mountServerHistory: options => { mounted = options; return { dispose() {} }; } })
    });
    await controller.ready;
    assert.equal(mounted.session, session);
    assert.ok(mounted.apiBaseUrl.pathname.endsWith('/api/'));
    assert.equal(typeof mounted.onSignOut, 'function');
    assert.equal(typeof mounted.onSessionExpired, 'function');
    assert.doesNotMatch(heading.textContent, /Signed in as/);
    assert.equal(submit.disabled, false);
  });
});

test('a fresh patient login mounts History; expiry disposes it and returns to login', async () => {
  await withLoginDocument(async ({ form, message }) => {
    const session = { userId: 'dev-patient-1', role: 'patient', csrfToken: 'test-csrf' };
    let mounted, disposed = 0;
    const controller = mountServerPortal('frontoffice', {
      auth: {
        readSession: async () => null,
        signIn: async (credentials, roles) => {
          assert.equal(credentials.email, 'patient@example.test');
          assert.deepEqual(roles, ['patient']);
          return session;
        }
      },
      loadPatientHistory: async () => ({ mountServerHistory: options => {
        mounted = options; return { dispose() { disposed++; } };
      } })
    });
    await controller.ready;
    await form.emit('submit');
    assert.equal(mounted.session, session);
    mounted.onSessionExpired('Your session has expired. Sign in again.');
    assert.equal(disposed, 1);
    assert.match(message.textContent, /session has expired/);
    assert.equal(form.hidden, false);
  });
});

test('the administrator keeps a session screen without mounting either clinical workspace', async () => {
  await withLoginDocument(async () => {
    const controller = mountServerPortal('backoffice', {
      auth: { readSession: async () => ({ userId: 'admin-1', role: 'administrator' }) },
      loadPatientHistory: async () => { assert.fail('Supervision must not mount patient history'); },
      loadStaffCare: async () => { assert.fail('Administrators must not mount professional care'); }
    });
    await controller.ready;
  });
});

test('a restored professional session opens the assigned care workspace', async () => {
  await withLoginDocument(async () => {
    const session = { userId: 'pro-1', role: 'professional', displayName: 'Dr Test' };
    let passed;
    const controller = mountServerPortal('backoffice', {
      auth: { readSession: async () => session },
      loadStaffCare: async () => ({ mountServerCare: options => { passed = options.session; return { dispose() {} }; } })
    });
    await controller.ready;
    assert.equal(passed, session);
  });
});
