// Opt-in HTTP regression against an already deployed WAR. No mocked server,
// no provisioned/modified users or measurements, and no persisted cookies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServerAuth } from '../../shared/server-auth.mjs';
import { createMeasurementsAdapter } from '../../frontoffice/measurements-adapter.mjs';

const email = process.env.SMARTCARE_PATIENT_EMAIL;
const password = process.env.SMARTCARE_PATIENT_PASSWORD;
const root = new URL(process.env.SMARTCARE_SERVER_URL || 'http://localhost:8080/smartcare/');

test('DEPLOYED patient login -> session -> real MongoDB history -> logout', {
  skip: !email || !password ? 'Set SMARTCARE_PATIENT_EMAIL and SMARTCARE_PATIENT_PASSWORD for a real patient account.' : false,
  timeout: 60000
}, async t => {
  const api = new URL('api/', root);
  let cookie = '';
  const statuses = [];
  // Node does not implement browser cookie credentials: retain only the cookie
  // returned by this test's own login, restricted to this API origin.
  async function request(url, options = {}) {
    assert.equal(new URL(url).origin, root.origin);
    const headers = new Headers(options.headers);
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(url, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith('SMARTCARE_SESSION=')) cookie = value.split(';')[0];
    }
    statuses.push({ path: new URL(url).pathname, status: response.status });
    return response;
  }
  const auth = createServerAuth(api, request);
  let session;
  try {
    await t.test('WildFly serves the patient entry and modules from the current working tree', async () => {
      for (const path of ['frontoffice/index.html', 'frontoffice/portal.mjs', 'shared/server-portal.mjs',
        'shared/portal.mjs', 'frontoffice/server-history.mjs', 'frontoffice/history.mjs',
        'frontoffice/measurements-adapter.mjs', 'frontoffice/sw.js']) {
        const response = await fetch(new URL('frontends/' + path, root), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200, path);
        const served = await response.text();
        const local = await readFile(new URL('../../' + path, import.meta.url), 'utf8');
        assert.equal(served, local, 'Stale deployed resource: ' + path);
      }
    });
    await t.test('a fresh cookie session returns HTTP 200 and the expected measurement', async () => {
      assert.equal(await auth.readSession(), null);
      assert.equal((await request(new URL('me/measurements', api))).status, 401);
      session = await auth.signIn({ email, password }, ['patient']);
      assert.equal(session.role, 'patient');
      if (process.env.SMARTCARE_EXPECTED_PATIENT_ID) assert.equal(session.userId, process.env.SMARTCARE_EXPECTED_PATIENT_ID);
      const result = await createMeasurementsAdapter({ apiBaseUrl: api, request }).getMeasurements();
      assert.equal(result.origin, 'server');
      assert.ok(result.rows.some(row => row.hr === 75 && row.spo2 === 98 && row.quality === 'good'),
        'Expected the existing MongoDB measurement of 75 bpm / 98 %.');
      const sessionCalls = statuses.filter(row => row.path.endsWith('/session'));
      const historyCalls = statuses.filter(row => row.path.endsWith('/me/measurements'));
      assert.equal(sessionCalls.at(-1).status, 200);
      assert.equal(historyCalls.at(-1).status, 200);
      const forged = await request(new URL('me/measurements?patientId=another-patient&userId=another-patient', api));
      assert.equal(forged.status, 200);
      const { normalizeMeasurements } = await import('../../frontoffice/measurements-adapter.mjs');
      assert.deepEqual(normalizeMeasurements(await forged.json()), result.rows);
    });
  } finally {
    if (session) {
      await auth.signOut(session);
      assert.equal(await auth.readSession(), null);
      assert.equal((await request(new URL('me/measurements', api))).status, 401);
    }
  }
});
