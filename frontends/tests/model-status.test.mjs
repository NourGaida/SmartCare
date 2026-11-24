import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { renderModelStatus } from '../backoffice/model-status.mjs';
import { mountServerCare } from '../backoffice/server-care.mjs';
import { createCareApi } from '../shared/care-api.mjs';

const base = new URL('http://localhost:8085/smartcare/api/');
const shadow = { available: true, version: 'fixture <v1>', mode: 'shadow' };

test('the model adapter uses the planned same-origin admin route and keeps metadata only', async () => {
  const { signal } = new AbortController();
  const api = createCareApi(base, {}, async (url, options) => {
    assert.equal(url.href, new URL('admin/model', base).href);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.method, 'GET');
    assert.equal(options.signal, signal);
    return Response.json({ model: { ...shadow, measurements: [] } });
  });
  assert.deepEqual(await api.modelStatus(signal), shadow);
});

test('model status renders loading and then escaped metadata with a shadow explanation', async () => {
  const view = {};
  let resolve;
  const task = renderModelStatus(view, () => new Promise(done => { resolve = done; }), new AbortController().signal);
  assert.match(view.innerHTML, /Chargement de l’état du modèle/);
  resolve(shadow);
  await task;
  assert.match(view.innerHTML, /Disponible/);
  assert.match(view.innerHTML, /fixture &lt;v1&gt;/);
  assert.match(view.innerHTML, /mode shadow observe les scores ML/);
  assert.match(view.innerHTML, /règles restent actives/);
});

test('empty model metadata differs from an unavailable analysis', async () => {
  const view = {};
  const { signal } = new AbortController();
  await renderModelStatus(view, async () => null, signal);
  assert.match(view.innerHTML, /Aucune information sur le modèle/);
  assert.match(view.innerHTML, /Réessayer/);
  await renderModelStatus(view, async () => ({ ...shadow, available: false }), signal);
  assert.match(view.innerHTML, /Analyse indisponible/);
  assert.match(view.innerHTML, /fixture &lt;v1&gt;/);
  assert.match(view.innerHTML, /Réessayer/);
});

test('network failures, forbidden access and invalid model metadata are retryable', async () => {
  const view = {};
  const { signal } = new AbortController();
  const fixtures = [
    () => { throw new Error('offline'); },
    () => Response.json({}, { status: 403 }),
    () => Response.json({ model: { available: 'yes' } })
  ];
  for (const request of fixtures) {
    await renderModelStatus(view, createCareApi(base, {}, request).modelStatus, signal);
    assert.match(view.innerHTML, /Analyse indisponible/);
    assert.match(view.innerHTML, /data-care-retry>Réessayer/);
  }
});

test('an aborted model request cannot overwrite another page', async () => {
  const view = {};
  const controller = new AbortController();
  let resolve;
  const task = renderModelStatus(view, () => new Promise(done => { resolve = done; }), controller.signal);
  controller.abort();
  view.innerHTML = 'another page';
  resolve(shadow);
  await task;
  assert.equal(view.innerHTML, 'another page');
});

test('admin sees the model route only, can retry after 404 and returns to login on 401', async t => {
  class Element extends EventTarget {
    setAttribute() {}
    removeAttribute() {}
    focus() {}
    querySelectorAll() { return []; }
    replaceChildren() { this.innerHTML = ''; }
  }
  const elements = new Map();
  const query = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const view = query('#view');
  const mockLocation = { hash: '#patient/another-patient' };
  const mockWindow = new EventTarget();
  mockWindow.history = { replaceState: (_, __, hash) => { mockLocation.hash = hash; } };
  const globals = { document: { querySelector: query }, location: mockLocation, window: mockWindow };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
  const calls = [];
  const replies = [
    new Response('', { status: 404 }),
    Response.json({ model: shadow }),
    new Response('', { status: 401 }),
    Response.json({ patients: [] })
  ];
  t.mock.method(globalThis, 'fetch', url => {
    calls.push(url.pathname);
    return replies.shift();
  });

  let expired;
  const admin = mountServerCare({
    session: { role: 'administrator', userId: 'test-admin' }, apiBaseUrl: base,
    onSessionExpired: message => { expired = message; }
  });
  await setImmediate();
  assert.equal(mockLocation.hash, '#model-status');
  assert.match(query('#navigation').innerHTML, /État du modèle/);
  assert.doesNotMatch(query('#navigation').innerHTML, /Assigned patients|Simulation/);
  assert.match(view.innerHTML, /Analyse indisponible/);

  // Dispatch the same delegated click as the button rendered in the view.
  view.closest = () => ({ hasAttribute: name => name === 'data-care-retry' });
  view.dispatchEvent(new Event('click'));
  await setImmediate();
  assert.match(view.innerHTML, /mode shadow/);
  mockWindow.dispatchEvent(new Event('hashchange'));
  await setImmediate();
  assert.match(expired, /session has expired/);
  assert.deepEqual(calls, Array(3).fill('/smartcare/api/admin/model'));
  admin.dispose();

  const professional = mountServerCare({ session: { role: 'professional', userId: 'test-professional' }, apiBaseUrl: base });
  await setImmediate();
  assert.equal(calls.at(-1), '/smartcare/api/patients');
  assert.doesNotMatch(query('#navigation').innerHTML, /État du modèle/);
  professional.dispose();
});
