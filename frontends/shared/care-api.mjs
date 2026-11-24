export function createCareApi(baseUrl, session, request = globalThis.fetch) {
  async function call(path, { signal, body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = session.csrfToken;
    }
    let response;
    try {
      response = await request(new URL(path, baseUrl), {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers, signal, body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('Could not reach SmartCare. Check your connection and retry.');
    }
    if (response.status === 401) {
      const error = new Error('Your session has expired. Sign in again.');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || `SmartCare returned HTTP ${response.status}. Please retry.`);
    }
    if (!data || typeof data !== 'object') throw new Error('SmartCare returned an invalid response.');
    return data;
  }

  async function list(path, key, signal) {
    const data = await call(path, { signal });
    if (!Array.isArray(data[key])) throw new Error('SmartCare returned an invalid list.');
    return data[key];
  }

  const item = value => encodeURIComponent(value);
  const patient = id => 'patients/' + item(id);
  return {
    async modelStatus(signal) {
      const { model } = await call('admin/model', { signal });
      if (model == null) return null;
      if (typeof model.available !== 'boolean') throw new Error('SmartCare returned invalid model metadata.');
      return {
        available: model.available,
        version: typeof model.version === 'string' ? model.version : null,
        mode: typeof model.mode === 'string' ? model.mode : null
      };
    },
    assignedPatients: signal => list('patients', 'patients', signal),
    patientMeasurements: (id, signal) => list(patient(id) + '/measurements', 'measurements', signal),
    patientAlerts: (id, signal) => list(patient(id) + '/alerts', 'alerts', signal),
    patientLatestSimulation: async (id, signal, deviceId) => {
      const query = deviceId ? '?' + new URLSearchParams({ deviceId }) : '';
      return (await call(patient(id) + '/latest-simulation' + query, { signal })).run;
    },
    myAlerts: signal => list('me/alerts', 'alerts', signal),
    myLatestSimulation: async signal => (await call('me/latest-simulation', { signal })).run,
    myDevices: signal => list('me/devices', 'devices', signal),
    acknowledge: (id, alertId, note, signal) => call(
      patient(id) + '/alerts/' + item(alertId) + '/acknowledgements', { signal, body: { note } }),
    startSimulation: (id, deviceId, scenario, signal) => call(
      patient(id) + '/simulations', { signal, body: { deviceId, scenario } }),
    simulation: (id, runId, signal) => call(patient(id) + '/simulations/' + item(runId), { signal })
  };
}
