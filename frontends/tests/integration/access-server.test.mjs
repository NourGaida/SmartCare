// REAL SERVER ONLY. No mocks and no guessed URL/session. All scenarios are explicitly
// skipped until Person B supplies the driver described in server-driver.example.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { accessCases, accessFixtures, serverDependencies } from '../fixtures/access.mjs';

const driverPath = process.env.SMARTCARE_SERVER_DRIVER;
const delay = ms => new Promise(done => setTimeout(done, ms));
async function until(predicate, description) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, description);
    await delay(25);
  }
}
const marker = (fixture, id) => fixture.readings[id][0].deviceId;
function assertAuthorized(response, expected, forbidden) {
  assert.equal(response.status, 200, 'Authorized control request must succeed; a missing route is not an access denial.');
  assert.equal(typeof response.body, 'string');
  assert.ok(response.body.includes(expected), 'The authorized fixture must actually be received.');
  assert.ok(!response.body.includes(forbidden), 'A different patient fixture was leaked.');
}

for (const surface of ['history', 'csv', 'live']) {
  for (const scenario of accessCases) {
    test('SERVER ' + surface + ': ' + scenario.name, {
      skip: driverPath ? false : 'BLOCKED — ' + serverDependencies[surface] + ' Set SMARTCARE_SERVER_DRIVER after these exist.',
      timeout: 20000
    }, async t => {
      const fixture = accessFixtures();
      const { createServerDriver } = await import(pathToFileURL(resolve(driverPath)).href);
      const driver = await createServerDriver();
      t.after(() => driver.cleanup());
      await driver.setup(fixture);
      const actor = await driver.login(scenario.actor);
      const control = await driver.login('patient');
      const request = { patientId: scenario.patientId };
      const own = marker(fixture, 'patient-001');
      const other = marker(fixture, 'patient-002');
      if (surface !== 'live') {
        assertAuthorized(await driver[surface](control, { patientId: 'patient-001' }), own, other);
        const response = await driver[surface](actor, request);
        if (scenario.allowed) assertAuthorized(response, own, other);
        else if (scenario.sessionSubject && response.status === 200) {
          assertAuthorized(response, own, other); // /me must ignore a forged client subject.
        } else {
          assert.ok([403, 404].includes(response.status), 'Expected an authorization denial, not 401, 5xx or an empty 200.');
          assert.equal(typeof response.body, 'string');
          assert.ok(!response.body.includes(own) && !response.body.includes(other), 'Denied response leaked health data.');
        }
        return;
      }
      const observed = [];
      const receivedOwn = [], receivedOther = [];
      const controlA = await driver.live(control, { patientId: 'patient-001' }, text => receivedOwn.push(text));
      t.after(() => controlA.close());
      const otherSession = await driver.login('otherPatient');
      const controlB = await driver.live(otherSession, { patientId: 'patient-002' }, text => receivedOther.push(text));
      t.after(() => controlB.close());
      assert.equal(controlA.accepted, true);
      assert.equal(controlB.accepted, true);
      const subscription = await driver.live(actor, request, text => observed.push(text));
      t.after(() => subscription.close());
      const scopeIgnored = scenario.sessionSubject && subscription.accepted;
      if (scenario.allowed || scopeIgnored) assert.equal(subscription.accepted, true);
      else {
        assert.equal(subscription.accepted, false, 'Unauthorized subscription was accepted.');
        assert.equal(subscription.denied, true, 'An unavailable endpoint is not an authorization denial.');
      }
      await driver.inject('patient-001', fixture.readings['patient-001'][0]);
      await driver.inject('patient-002', fixture.readings['patient-002'][0]);
      await until(() => receivedOwn.some(text => text.includes(own)) &&
        receivedOther.some(text => text.includes(other)), 'Both authorized controls must prove real live delivery.');
      if (scenario.allowed || scopeIgnored) {
        await until(() => observed.some(text => text.includes(own)), 'Authorized subscription received no fixture.');
      }
      await delay(1000); // Bounded negative observation after the two positive control deliveries.
      assert.ok(observed.every(text => typeof text === 'string'));
      if (scenario.allowed || scopeIgnored) assert.ok(observed.every(text => !text.includes(other)));
      else {
        assert.ok(observed.every(text => !text.includes(own) && !text.includes(other)));
      }
    });
  }
}
