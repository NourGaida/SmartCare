import { createDemoAuth, DEMO_ACCOUNTS } from '../shared/auth.mjs';
import { AccessError } from '../shared/domain.mjs';
import { downloadCSV, formatTime } from '../shared/ui.mjs';
import { createSupervisionAdapter } from './adapter.mjs';
import * as views from './views.mjs';

const $ = selector => document.querySelector(selector);
const auth = createDemoAuth(['professional', 'administrator']);
let adapter = null;
let revision = 0;
let toastTimer;
const state = {
  patients: [], patientId: null, alert: null, exportRows: [],
  history: { minutes: '15', quality: 'all', metric: 'hr', page: 1, end: Date.now() },
  alertFilters: { patientId: '', state: 'all' }
};
const routes = {
  professional: [['patients', 'Assigned patients'], ['alerts', 'Alert episodes']],
  administrator: [['accounts', 'Accounts'], ['assignments', 'Assignments'],
    ['devices', 'Devices'], ['services', 'Services'], ['model', 'Model']]
};
const descriptions = {
  patients: 'Your fictional patients, their latest signals and the episodes to review.',
  patient: 'Current measurements, history and alert episodes for an assigned patient.',
  alerts: 'Review episodes and record acknowledgement without resolving them.',
  alert: 'Review the evidence available for this demonstration episode.',
  accounts: 'Manage fictional accounts and roles in this session.',
  assignments: 'Manage who is assigned to each fictional patient.',
  devices: 'Register, assign and revoke demonstration devices.',
  services: 'A demonstration of operational availability.',
  model: 'Availability, version and mode when supplied by the model service.'
};
const navPaths = {
  patients: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
  alerts: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  accounts: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  assignments: '<path d="M4 6h16M4 12h16M4 18h16m-4-4 4 4-4 4"/>',
  devices: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 7h6m-6 5h6m-4 5h2"/>',
  services: '<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  model: '<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m14 0h3M2 15h3m14 0h3"/>'
};

function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

function route() {
  const [name, rawId] = location.hash.slice(1).split('/');
  try { return { name, id: rawId ? decodeURIComponent(rawId) : null }; }
  catch { throw new AccessError('Access denied. Invalid workspace identifier.'); }
}

function renderNavigation(name, needsReview = 0) {
  const role = auth.getSession().role;
  $('#navigation').innerHTML = routes[role].map(([key, label]) => {
    const active = key === name || (key === 'patients' && name === 'patient') || (key === 'alerts' && name === 'alert');
    return '<a href="#' + key + '"' + (active ? ' class="active" aria-current="page"' : '') +
      '><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + navPaths[key] +
      '</svg><span>' + label + '</span>' +
      (key === 'alerts' && needsReview ? '<span class="nav-count" aria-label="' + needsReview + ' alerts to review">' + needsReview + '</span>' : '') + '</a>';
  }).join('');
}

async function render() {
  const user = auth.getSession();
  if (!user || !adapter) return;
  const currentRevision = ++revision;
  const currentAdapter = adapter;
  $('#view').setAttribute('aria-busy', 'true');
  $('#view').innerHTML = '<div class="panel state-card" role="status">Loading demo workspace…</div>';
  state.exportRows = []; state.alert = null;
  try {
    const current = route();
    const allowed = routes[user.role].map(([name]) => name).concat(user.role === 'professional' ? ['patient', 'alert'] : []);
    if (!current.name || current.name === 'login') {
      location.hash = routes[user.role][0][0];
      return;
    }
    if (!allowed.includes(current.name)) throw new AccessError();
    let html;
    let title = routes[user.role].find(([name]) => name === current.name)?.[1] || 'Patient details';
    let patients = [];
    if (user.role === 'professional') patients = await currentAdapter.getAssignedPatients();
    if (currentRevision !== revision || auth.getSession() !== user) return;
    if (current.name === 'patients') {
      state.patients = patients;
      html = views.patientsView(patients);
    } else if (current.name === 'patient') {
      if (state.patientId !== current.id) {
        state.history = { minutes: '15', quality: 'all', metric: 'hr', page: 1, end: Date.now() };
      }
      state.patientId = current.id;
      const patient = await currentAdapter.getPatient(current.id);
      const [rows, history, alerts] = await Promise.all([
        currentAdapter.getMeasurements(current.id, state.history),
        currentAdapter.getHistory(current.id, state.history, state.history.page),
        currentAdapter.getAlerts({ patientId: current.id })
      ]);
      if (currentRevision !== revision || auth.getSession() !== user) return;
      state.exportRows = rows;
      state.history.page = history.page;
      title = patient.name;
      html = views.patientView(patient, rows, history, alerts, state.history);
    } else if (current.name === 'alerts') {
      const alerts = await currentAdapter.getAlerts(state.alertFilters);
      html = views.alertsView(alerts, patients, state.alertFilters);
    } else if (current.name === 'alert') {
      const alerts = await currentAdapter.getAlerts();
      if (currentRevision !== revision || auth.getSession() !== user) return;
      const alert = alerts.find(item => item.id === current.id);
      if (!alert) throw new AccessError('Access denied. This alert is not available in your assigned workspace.');
      state.alert = alert;
      title = 'Alert details';
      html = views.alertView(alert);
    } else if (current.name === 'accounts') html = views.accountsView(await currentAdapter.getAccounts());
    else if (current.name === 'assignments') html = views.assignmentsView(await currentAdapter.getAssignments());
    else if (current.name === 'devices') html = views.devicesView(await currentAdapter.getDevices());
    else if (current.name === 'services') html = views.servicesView(await currentAdapter.getServices());
    else if (current.name === 'model') html = views.modelView(await currentAdapter.getModel());
    if (currentRevision !== revision || auth.getSession() !== user) return;
    $('#page-title').textContent = title;
    $('#page-description').textContent = descriptions[current.name];
    $('#breadcrumb').textContent = title;
    const open = patients.reduce((sum, patient) => sum + patient.openAlerts, 0);
    const review = patients.reduce((sum, patient) => sum + patient.needsAcknowledgement, 0);
    $('#workspace-summary').textContent = user.role === 'professional'
      ? open + ' open episodes · ' + review + ' to acknowledge' : 'Administrative data only · availability is simulated';
    renderNavigation(current.name, review);
    $('#view').innerHTML = html;
  } catch (error) {
    if (currentRevision !== revision || auth.getSession() !== user) return;
    state.exportRows = []; state.alert = null;
    $('#page-title').textContent = error.code === 'FORBIDDEN' ? 'Access denied' : error.code === 'LOADING' ? 'Loading data' : 'Workspace unavailable';
    $('#page-description').textContent = '';
    $('#breadcrumb').textContent = $('#page-title').textContent;
    $('#view').innerHTML = views.stateView($('#page-title').textContent, error.message);
    renderNavigation('');
  } finally {
    if (currentRevision === revision) $('#view').removeAttribute('aria-busy');
  }
}

function logout() {
  ++revision;
  adapter?.logout(); adapter = null;
  state.patients = []; state.exportRows = []; state.alert = null; state.patientId = null;
  state.alertFilters = { patientId: '', state: 'all' };
  $('#workspace').hidden = true; $('#login-screen').hidden = false;
  ['#view', '#navigation', '#profile-name', '#profile-initials', '#profile-role', '#workspace-summary', '#page-title', '#page-description', '#breadcrumb'].forEach(selector => { $(selector).textContent = ''; });
  clearTimeout(toastTimer); $('#toast').hidden = true; $('#toast').textContent = '';
  $('#login-form').reset(); $('#login-message').textContent = '';
  $('#preview-state').value = 'normal';
  history.replaceState(null, '', '#login');
  $('#login-form input').focus();
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  $('#login-submit').disabled = true;
  $('#login-message').textContent = 'Opening demo session…';
  try {
    const user = await auth.login(Object.fromEntries(new FormData(form)));
    adapter = createSupervisionAdapter(auth);
    $('#profile-name').textContent = user.name;
    $('#profile-role').textContent = user.role + ' · Demo account';
    $('#profile-initials').textContent = user.name.split(' ').map(word => word[0]).slice(0, 2).join('');
    $('#portal-label').textContent = user.role === 'professional' ? 'PROFESSIONAL PORTAL' : 'ADMINISTRATION';
    $('#workspace-brand').href = '#' + routes[user.role][0][0];
    $('#page-eyebrow').textContent = user.role === 'professional' ? 'YOUR CARE WORKSPACE' : 'YOUR OPERATIONS WORKSPACE';
    $('#login-screen').hidden = true; $('#workspace').hidden = false;
    $('#login-message').textContent = ''; form.reset();
    const requested = location.hash.slice(1);
    if (!requested || requested === 'login') history.replaceState(null, '', '#' + routes[user.role][0][0]);
    await render(); $('#main-content').focus();
  } catch (error) { $('#login-message').textContent = error.message; }
  finally { $('#login-submit').disabled = false; }
});

document.addEventListener('click', async event => {
  const demoButton = event.target.closest('[data-demo-role]');
  if (demoButton) {
    const account = DEMO_ACCOUNTS[demoButton.dataset.demoRole];
    $('#login-form [name="email"]').value = account.email;
    $('#login-form [name="password"]').value = account.password;
    $('#login-form').requestSubmit();
    return;
  }
  if (event.target.closest('[data-logout]')) { logout(); return; }
  if (!adapter || !auth.getSession()) return;
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  try {
    if (target.hasAttribute('data-retry')) {
      adapter.setPreview('normal'); $('#preview-state').value = 'normal';
      if (route().name === 'patient' || route().name === 'alert') {
        location.hash = routes[auth.getSession().role][0][0]; return;
      }
    } else if (target.hasAttribute('data-page')) state.history.page = Number(target.dataset.page);
    else if (target.hasAttribute('data-export')) {
      // Fetch again through the guarded adapter, rather than trusting a stored patient ID.
      const rows = await adapter.getMeasurements(route().id, state.history);
      downloadCSV(rows, 'smartcare-' + route().id + '-demo.csv');
      notify(rows.length + ' selected readings exported.'); return;
    } else if (target.hasAttribute('data-toggle-account')) {
      await adapter.updateAccount(target.dataset.toggleAccount, { active: target.dataset.active === 'true' });
      notify('Demo account status updated.');
    } else if (target.hasAttribute('data-remove-patient')) {
      await adapter.removeAssignment(target.dataset.removePatient, target.dataset.professional); notify('Demo assignment removed.');
    } else if (target.hasAttribute('data-revoke-device')) {
      await adapter.revokeDevice(target.dataset.revokeDevice); notify('Demo device revoked.');
    } else return;
    await render();
  } catch (error) { notify(error.message); }
});

$('#view').addEventListener('submit', async event => {
  const form = event.target.closest('form[data-action]');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity() || !adapter) return;
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('button[type="submit"], button:not([type])');
  if (submit) submit.disabled = true;
  try {
    const action = form.dataset.action;
    if (action === 'history-filters') state.history = { ...data, end: Date.now(), page: 1 };
    else if (action === 'alert-filters') state.alertFilters = data;
    else if (action === 'acknowledge') { await adapter.acknowledgeAlert(route().id, data.note); notify('Acknowledged. The episode has not been resolved.'); }
    else if (action === 'create-account') { await adapter.createAccount(data); notify('Fictional account created.'); }
    else if (action === 'assign-patient') { await adapter.assignPatient(data.patientId, data.professionalId); notify('Demo patient assigned.'); }
    else if (action === 'register-device') { await adapter.registerDevice(data); notify('Fictional device registered.'); }
    else if (action === 'assign-device') { await adapter.assignDevice(data.deviceId, data.patientId); notify('Demo device assigned.'); }
    await render();
  } catch (error) { notify(error.message); }
  finally { if (submit?.isConnected) submit.disabled = false; }
});

function filterPatients() {
  $('#patient-results').innerHTML = views.patientCards(state.patients, $('#patient-search').value, $('#patient-state').value);
}
$('#view').addEventListener('input', event => { if (event.target.id === 'patient-search') filterPatients(); });
$('#view').addEventListener('change', async event => {
  if (event.target.id === 'patient-state') { filterPatients(); return; }
  if (event.target.hasAttribute('data-account-role')) {
    try { await adapter.updateAccount(event.target.dataset.accountRole, { role: event.target.value }); notify('Demo role updated.'); }
    catch (error) { notify(error.message); }
    await render();
  }
});
$('#preview-state').addEventListener('change', async event => {
  adapter?.setPreview(event.target.value); await render();
});
window.addEventListener('hashchange', () => { if (auth.getSession()) { render(); $('#main-content').focus(); } });
$('#current-date').textContent = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(new Date());
setInterval(() => {
  if (!auth.getSession()) return;
  document.querySelectorAll('[data-freshness]').forEach(element => {
    const value = element.dataset.freshness;
    const timestamp = value === '' ? NaN : Number(value);
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp >= 30000;
    element.classList.toggle('stale', stale);
    element.textContent = !Number.isFinite(timestamp) ? 'No current measurements' :
      (stale ? 'Data outdated · ' : 'Updated · ') + formatTime(timestamp);
  });
  document.querySelectorAll('[data-connection]').forEach(element => {
    const value = element.dataset.connection;
    const timestamp = value === '' ? NaN : Number(value);
    const stale = !Number.isFinite(timestamp) || Date.now() - timestamp >= 30000;
    element.classList.toggle('warning', stale);
    element.textContent = !Number.isFinite(timestamp) ? 'Unavailable' : stale ? 'Disconnected · data outdated' : 'Connected';
  });
  const counter = document.querySelector('[data-connected-count]');
  if (counter) counter.textContent = state.patients.filter(patient => patient.latest && Date.now() - patient.latest.timestamp < 30000).length;
}, 1000);
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => notify('Offline installation unavailable. The demo remains usable online.'));
}
