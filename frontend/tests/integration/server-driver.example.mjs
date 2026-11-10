// Contract for Person B's REAL server test adapter; deliberately not a mock.
// Implement in a separate local file and point SMARTCARE_SERVER_DRIVER at that file.
// Read frontend/access-verification.md before wiring real URLs and session handling.
export async function createServerDriver() {
  const missing = operation => { throw new Error('Person B integration is not implemented: ' + operation); };
  return {
    // Provision two fictional patients, their accounts/devices, one professional
    // assigned only to patient-001, one administrator, and the fixture measurements.
    // Must use the agreed isolated test DB and actual ownership/enrollment model.
    async setup(fixture) { missing('test data provisioning / cleanup strategy'); },
    // Return a REAL authenticated session (cookie/token + any CSRF state).
    // actor is patient, otherPatient, professional or administrator.
    async login(actor) { missing('authentication endpoint and test sessions'); },
    // Map to the agreed REAL route; inject patientId wherever the client can send it
    // (path/query/body), including tampering on a /me route if that is the contract.
    // Return {status, body} with the unmodified response text; fetch cache: no-store.
    async history(session, { patientId }) { missing('history REST route, DTO and session scope'); },
    async csv(session, { patientId }) { missing('CSV route, filters and session scope'); },
    // Open an actual WebSocket; await handshake/subscription acknowledgement or explicit denial.
    // onMessage receives RAW text frames, including error frames (never a fabricated envelope).
    // Return {accepted, denied, close: async () => ...}. Handle connection-level and
    // message-level denials. A missing endpoint / socket error is a test failure.
    async live(session, { patientId }, onMessage) { missing('WebSocket URL, auth and subscription/denial protocol'); },
    // Inject through the real deterministic test ingestion path, not the UI or a fake bus.
    async inject(patientId, reading) { missing('test measurement ingestion and real event dispatch'); },
    async cleanup() { /* Remove only data created by setup and close sessions/sockets. */ }
  };
}
