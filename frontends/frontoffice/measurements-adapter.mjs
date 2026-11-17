// Provisional API contract: change this single conversion when Person B confirms the DTO.
export class MeasurementHistoryError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function normalizeMeasurements(payload) {
  const measurements = Array.isArray(payload) ? payload : payload?.measurements;
  const invalid = () => { throw new MeasurementHistoryError('FORMAT', 'The measurement API returned an unsupported response. Please retry.'); };
  if (!Array.isArray(measurements)) invalid();
  return measurements.map(item => {
    if (!item || typeof item.acquiredAtUtc !== 'string' ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(item.acquiredAtUtc)) invalid();
    const timestamp = Date.parse(item.acquiredAtUtc);
    if (!Number.isFinite(timestamp) || !['good', 'invalid'].includes(item.quality) ||
        ![item.heartRate, item.spo2].every(value => value === null || (typeof value === 'number' && Number.isFinite(value))) ||
        (item.quality === 'good' && (item.heartRate === null || item.spo2 === null))) invalid();
    return {
      timestamp,
      hr: item.quality === 'good' ? item.heartRate : null,
      spo2: item.quality === 'good' ? item.spo2 : null,
      quality: item.quality,
      reason: typeof item.reason === 'string' ? item.reason : null,
      deviceId: typeof item.deviceId === 'string' ? item.deviceId : '',
      source: typeof item.source === 'string' ? item.source : 'server'
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

export function createMeasurementsAdapter({
  mode = 'server',
  apiBaseUrl = new URL('../../api/', import.meta.url),
  exampleUrl = new URL('./fixtures/measurement-history.json', import.meta.url),
  request = globalThis.fetch
} = {}) {
  if (!['server', 'demo'].includes(mode)) throw new Error('Unknown measurement history mode.');
  const url = mode === 'server' ? new URL('me/measurements', apiBaseUrl) : new URL(exampleUrl);
  return {
    mode,
    async getMeasurements({ signal } = {}) {
      let response;
      try {
        response = await request(url, {
          method: 'GET', headers: { Accept: 'application/json' },
          credentials: mode === 'server' ? 'same-origin' : 'omit',
          cache: 'no-store', redirect: 'error', signal
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new MeasurementHistoryError('NETWORK',
          mode === 'server' ? 'Measurement history is unavailable. Check your connection and retry.' :
            'The fictional JSON example is unavailable. Connect to the static server and retry.');
      }
      if (mode === 'server' && response.status === 401) {
        throw new MeasurementHistoryError('SESSION_EXPIRED', 'Your session has expired. Sign in again.');
      }
      if (!response.ok) {
        throw new MeasurementHistoryError('HTTP',
          (mode === 'server' ? 'Measurement history API is unavailable' : 'The fictional JSON example is unavailable') +
          ' (HTTP ' + response.status + '). Please retry.');
      }
      let payload;
      try { payload = await response.json(); }
      catch { throw new MeasurementHistoryError('FORMAT', 'The measurement API returned invalid JSON. Please retry.'); }
      return { rows: normalizeMeasurements(payload), origin: mode };
    }
  };
}
