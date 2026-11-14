// Deliberately public demo credentials. No secure authentication is simulated.
export const DEMO_ACCOUNTS = Object.freeze({
  patient: { id: 'patient-001', name: 'Jamie Davis', email: 'patient@smartcare.demo', password: 'demo-patient', role: 'patient' },
  professional: { id: 'pro-001', name: 'Dr Morgan Ellis', email: 'professional@smartcare.demo', password: 'demo-professional', role: 'professional' },
  administrator: { id: 'admin-001', name: 'Robin Lee', email: 'admin@smartcare.demo', password: 'demo-admin', role: 'administrator' }
});

// Replace this factory with an API adapter when server authentication is ready.
export function createDemoAuth(allowedRoles) {
  let session = null;
  return {
    getSession: () => session,
    async login({ email, password }) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
        throw new Error('Enter a valid email address and a password.');
      }
      const account = Object.values(DEMO_ACCOUNTS).find(item =>
        item.email === email.trim().toLowerCase() && item.password === password);
      if (!account || !allowedRoles.includes(account.role)) {
        throw new Error('Use one of the demo accounts shown on this page.');
      }
      session = Object.freeze({ id: account.id, name: account.name, role: account.role, demo: true });
      return session;
    },
    logout() { session = null; }
  };
}
