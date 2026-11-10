import { administrativeFixtures } from './fixtures/administrative.mjs';
import { requireRole, requirePatientAccess, assignedPatientIds, acknowledge,
  filterReadings, paginate, readingsCSV, AccessError } from '../shared/domain.mjs';
import { createDemoUpdates } from '../shared/demo-updates.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const ROLES = ['patient', 'professional', 'administrator'];

export function createSupervisionAdapter(auth, {
  now = () => Date.now(),
  administrativeData = administrativeFixtures(now()),
  updates = createDemoUpdates(),
  loadClinical = async () => (await import('./fixtures/clinical.mjs')).clinicalFixtures(now())
} = {}) {
  let registry = copy(administrativeData);
  const subscriptions = new Set();
  let clinical = null;
  let preview = 'normal';
  let nextAccount = 1;
  const owner = auth.getSession();
  const session = () => auth.getSession() === owner ? owner : null;
  const admin = () => requireRole(session(), 'administrator');
  const professional = () => requireRole(session(), 'professional');
  const patient = id => {
    professional();
    requirePatientAccess(session(), registry.assignments, id);
  };
  const checkPreview = () => {
    if (preview === 'error') throw new Error('Simulated service error. Choose Normal and retry.');
    if (preview === 'loading') throw Object.assign(new Error('Loading demonstration data… Choose Normal to finish.'), { code: 'LOADING' });
  };
  async function clinicalData() {
    professional();
    checkPreview();
    if (!clinical) {
      const loaded = await loadClinical();
      // A pending load must never complete into a logged-out or replaced session.
      professional();
      clinical = loaded;
    }
    return clinical;
  }
  const find = (items, id) => {
    const item = items.find(row => row.id === id);
    if (!item) throw new Error('Item not found.');
    return item;
  };

  return {
    setPreview(value) {
      if (!session()) throw new AccessError();
      if (!['normal', 'empty', 'error', 'loading', 'unavailable', 'available'].includes(value)) throw new Error('Unknown preview.');
      preview = value;
    },
    async getAssignedPatients() {
      professional();
      const data = await clinicalData();
      if (preview === 'empty') return [];
      return copy(assignedPatientIds(session(), registry.assignments).map(id => {
        const rows = data.readings[id] || [];
        const alerts = data.alerts.filter(alert => alert.patientId === id);
        return { ...find(registry.patients, id), latest: rows.at(-1) || null,
          openAlerts: alerts.filter(alert => alert.state !== 'resolved').length,
          needsAcknowledgement: alerts.filter(alert => alert.state === 'open').length };
      }));
    },
    async getPatient(id) {
      patient(id);
      const data = await clinicalData();
      return copy({ ...find(registry.patients, id),
        latest: preview === 'empty' ? null : (data.readings[id] || []).at(-1) || null });
    },
    async getMeasurements(id, filters = {}) {
      patient(id);
      const data = await clinicalData();
      return preview === 'empty' ? [] : copy(filterReadings(data.readings[id] || [], filters));
    },
    async getHistory(id, filters = {}, page = 1) {
      return paginate((await this.getMeasurements(id, filters)).reverse(), page);
    },
    async exportCSV(id, filters = {}) {
      return readingsCSV(await this.getMeasurements(id, filters));
    },
    subscribeUpdates(id, receive) {
      patient(id); // Reject before registering a listener or loading any clinical data.
      const stop = updates.subscribe(id, receive, () => patient(id));
      subscriptions.add(stop);
      return () => { stop(); subscriptions.delete(stop); };
    },
    async getAlerts({ patientId, state = 'all' } = {}) {
      professional();
      if (patientId) patient(patientId);
      const ids = assignedPatientIds(session(), registry.assignments);
      const data = await clinicalData();
      if (preview === 'empty') return [];
      return copy(data.alerts.filter(alert => ids.includes(alert.patientId) &&
        (!patientId || alert.patientId === patientId) && (state === 'all' || alert.state === state)));
    },
    async acknowledgeAlert(id, note) {
      professional();
      const data = await clinicalData();
      const index = data.alerts.findIndex(alert => alert.id === id);
      if (index < 0) throw new AccessError();
      data.alerts[index] = acknowledge(data.alerts[index], session(), registry.assignments, note, now());
      return copy(data.alerts[index]);
    },
    async getAccounts() { admin(); checkPreview(); return preview === 'empty' ? [] : copy(registry.accounts); },
    async createAccount({ name, email, role }) {
      admin();
      name = name.trim(); email = email.trim().toLowerCase();
      if (!name || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 120 || !ROLES.includes(role)) throw new Error('Check the name, email and role.');
      if (registry.accounts.some(item => item.email === email)) throw new Error('This email is already registered in the demo.');
      const account = { id: 'demo-account-' + nextAccount++, name, email, role, active: true };
      registry.accounts.push(account);
      return copy(account);
    },
    async updateAccount(id, changes) {
      admin();
      const account = find(registry.accounts, id);
      if (changes.role != null && !ROLES.includes(changes.role)) throw new Error('Invalid role.');
      if (changes.active != null && typeof changes.active !== 'boolean') throw new Error('Invalid account status.');
      if (id === session().id && (changes.active === false || (changes.role && changes.role !== 'administrator'))) {
        throw new Error('Keep your own demo administrator account active.');
      }
      Object.assign(account, { role: changes.role ?? account.role, active: changes.active ?? account.active });
      return copy(account);
    },
    async getAssignments() {
      admin(); checkPreview();
      return copy({ assignments: preview === 'empty' ? [] : registry.assignments,
        patients: registry.patients,
        professionals: registry.accounts.filter(row => row.role === 'professional' && row.active) });
    },
    async assignPatient(patientId, professionalId) {
      admin(); find(registry.patients, patientId);
      const account = find(registry.accounts, professionalId);
      if (account.role !== 'professional' || !account.active) throw new Error('Choose an active professional.');
      if (registry.assignments.some(row => row.patientId === patientId && row.professionalId === professionalId)) {
        throw new Error('This assignment already exists.');
      }
      registry.assignments.push({ patientId, professionalId });
    },
    async removeAssignment(patientId, professionalId) {
      admin();
      registry.assignments = registry.assignments.filter(row => !(row.patientId === patientId && row.professionalId === professionalId));
    },
    async getDevices() {
      admin(); checkPreview();
      return copy({ devices: preview === 'empty' ? [] : registry.devices, patients: registry.patients });
    },
    async registerDevice({ id, label }) {
      admin(); id = id.trim(); label = label.trim();
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || !label || label.length > 80) throw new Error('Use a device ID with letters, digits, - or _, and a label.');
      if (registry.devices.some(row => row.id === id)) throw new Error('Device already registered.');
      registry.devices.push({ id, label, patientId: null, status: 'active' });
    },
    async assignDevice(deviceId, patientId) {
      admin(); const device = find(registry.devices, deviceId); find(registry.patients, patientId);
      if (device.status === 'revoked') throw new Error('A revoked device cannot be assigned.');
      if (registry.devices.some(row => row.patientId === patientId && row.status === 'active' && row.id !== deviceId)) {
        throw new Error('Revoke the previous device before assigning a replacement.');
      }
      device.patientId = patientId;
    },
    async revokeDevice(id) {
      admin(); const device = find(registry.devices, id); device.status = 'revoked'; device.patientId = null;
    },
    async getServices() {
      admin(); checkPreview();
      if (preview === 'empty') return [];
      return copy(registry.services.map(row => ({ ...row, simulated: true,
        available: preview === 'unavailable' ? false : preview === 'available' ? true : row.available })));
    },
    async getModel() {
      admin(); checkPreview();
      return copy(preview === 'available'
        ? { available: true, version: 'demo-model-v1', mode: 'demonstration', checkedAt: now(), simulated: true }
        : { ...registry.model, simulated: true });
    },
    logout() {
      subscriptions.forEach(stop => stop()); subscriptions.clear();
      auth.logout();
      if (clinical) { clinical.readings = {}; clinical.alerts = []; }
      clinical = null; registry = null;
    }
  };
}
