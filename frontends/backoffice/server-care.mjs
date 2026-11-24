import { createCareApi } from '../shared/care-api.mjs';
import { careState, connectedAlerts, measurementCharts, panelMarkup } from '../shared/connected-views.mjs';
import { mountConnectivity } from '../shared/connectivity.mjs';
import { pollCare } from '../shared/poll-care.mjs';
import { escapeHTML as h, formatTime } from '../shared/ui.mjs';
import { normalizeMeasurements } from '../frontoffice/measurements-adapter.mjs';
import { readingsTable } from './views.mjs';
import { simulationControls, simulationResult } from './simulation-view.mjs';

export function mountServerCare({ session, apiBaseUrl, onSignOut, onSessionExpired }) {
  if (session.role !== 'professional') throw new Error('A professional session is required.');
  const api = createCareApi(apiBaseUrl, session);
  const $ = selector => document.querySelector(selector);
  const workspace = $('#workspace');
  const view = $('#view');
  const stopConnectivity = mountConnectivity($('#connectivity-notice'), { connected: true });
  const name = session.displayName || session.userId;
  let scope = null;
  let stopUpdates = () => {};
  let selectedDevice = '';
  let activePatient = null;

  $('#profile-name').textContent = name;
  $('#profile-role').textContent = 'Professional';
  $('#profile-initials').textContent = name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
  $('#current-date').textContent = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date());
  $('#login-screen').hidden = true;
  workspace.hidden = false;
  $('.skip-link').href = '#main-content';

  function onError(error, current, target = view) {
    if (scope !== current || current.signal.aborted) return;
    if (error.code === 'SESSION_EXPIRED') {
      onSessionExpired(error.message);
      return;
    }
    target.innerHTML = careState(error.message, { retry: true });
  }

  function navigation(active) {
    $('#navigation').innerHTML = [
      ['patients', 'Assigned patients'],
      ['simulation', 'Simulation des capteurs']
    ].map(([route, label]) => '<a href="#' + route + '"' +
      (active === route ? ' class="active" aria-current="page"' : '') + '>' +
      '<span>' + h(label) + '</span></a>').join('');
  }

  function title(name, description) {
    $('#page-title').textContent = name;
    $('#breadcrumb').textContent = name;
    $('#page-description').textContent = description;
  }

  function patientCards(patients) {
    if (!patients.length) return careState('You have no assigned patients.');
    return '<div class="patients-grid">' + patients.map(patient => {
      const latest = patient.latest;
      const devices = patient.devices.map(device => device.deviceId).join(', ');
      return '<article class="panel patient-card"><div class="patient-card-header"><div><h2>' +
        h(patient.name) + '</h2><span class="patient-code">' + h(devices || 'No assigned device') +
        '</span></div></div><div class="patient-values"><div><small>Heart rate</small><strong>' +
        h(latest?.heartRate ?? '—') + '</strong> <span class="unit">bpm</span></div><div><small>Blood oxygen</small><strong>' +
        h(latest?.spo2 ?? '—') + '</strong> <span class="unit">%</span></div></div><dl><div><dt>Last reading</dt><dd>' +
        h(latest ? formatTime(Date.parse(latest.acquiredAtUtc)) : 'No measurements') +
        '</dd></div><div><dt>Rule alerts to acknowledge</dt><dd>' + h(patient.needsAcknowledgement) +
        '</dd></div></dl><a class="button button-primary" href="#patient/' + encodeURIComponent(patient.id) +
        '">View details</a></article>';
    }).join('') + '</div>';
  }

  async function render() {
    stopUpdates();
    scope?.abort();
    const current = scope = new AbortController();
    activePatient = null;
    const [route, id] = location.hash.slice(1).split('/');
    navigation(route === 'simulation' ? 'simulation' : 'patients');
    title(route === 'simulation' ? 'Simulation des capteurs' : 'Assigned patients',
      route === 'simulation' ? 'Send sensor test readings through the SmartCare pipeline.' : 'Patients assigned to your account.');
    view.setAttribute('aria-busy', 'true');
    view.innerHTML = careState('Loading from SmartCare…');
    try {
      const patients = await api.assignedPatients(current.signal);
      if (scope !== current) return;
      if (route === 'simulation') {
        view.innerHTML = simulationControls(patients, { selectedDevice });
        const option = $('#simulation-device')?.selectedOptions[0];
        if (option) monitorSimulation(current, option);
        return;
      }
      if (route !== 'patient' || !id) {
        view.innerHTML = '<div class="care-actions"><button class="button button-outline" data-care-retry>Refresh</button></div>' +
          patientCards(patients);
        return;
      }
      const patient = patients.find(row => row.id === decodeURIComponent(id));
      if (!patient) {
        view.innerHTML = careState('This patient is outside your assigned workspace.');
        return;
      }
      const measurements = await api.patientMeasurements(patient.id, current.signal);
      if (scope !== current) return;
      activePatient = patient.id;
      title(patient.name, 'Measurements and rule alerts for your assigned patient.');
      const rows = normalizeMeasurements(measurements);
      const latest = rows.slice(-60);
      view.innerHTML = '<div class="care-actions"><a class="button button-outline" href="#patients">Back to assigned patients</a>' +
        '<button class="button button-outline" data-care-retry>Refresh</button></div><div class="stack">' +
        '<div id="patient-live-alerts" aria-live="polite"></div><div id="patient-live-scenario"></div>' +
        panelMarkup('Measurement history', rows.length + ' readings · displaying up to 60 recent readings', measurementCharts(latest) +
          readingsTable(latest.slice().reverse())) + '</div>';
      watchPatient(patient.id, current, {
        alertsView: $('#patient-live-alerts'), scenarioView: $('#patient-live-scenario'), acknowledge: true
      });
    } catch (error) {
      onError(error, current);
    } finally {
      if (scope === current) view.removeAttribute('aria-busy');
    }
  }

  function toggleScenarioButtons(disabled) {
    view.querySelectorAll('[data-scenario]').forEach(button => { button.disabled = disabled; });
    const device = $('#simulation-device');
    if (device) device.disabled = disabled;
  }

  function watchPatient(patientId, current, { alertsView, scenarioView, acknowledge = false, deviceId }) {
    let lastAlerts, lastScenario;
    stopUpdates = pollCare(current.signal, signal => Promise.all([
      api.patientAlerts(patientId, signal),
      api.patientLatestSimulation(patientId, signal, deviceId)
    ]), ([alerts, run]) => {
      const alertsHtml = connectedAlerts(alerts, { acknowledge });
      const snapshot = run ? { ...run, rows: normalizeMeasurements(run.measurements) } : null;
      const scenarioHtml = simulationResult(snapshot);
      if (alertsHtml !== lastAlerts) {
        const notes = new Map([...alertsView.querySelectorAll('[data-ack-alert]')].map(form =>
          [form.dataset.ackAlert, form.elements.namedItem('note').value]));
        alertsView.innerHTML = lastAlerts = alertsHtml;
        for (const form of alertsView.querySelectorAll('[data-ack-alert]')) {
          form.elements.namedItem('note').value = notes.get(form.dataset.ackAlert) || '';
        }
      }
      if (scenarioHtml !== lastScenario) scenarioView.innerHTML = lastScenario = scenarioHtml;
      if (deviceId) toggleScenarioButtons(run?.status === 'running');
    }, error => {
      lastAlerts = lastScenario = undefined;
      alertsView.replaceChildren();
      if (deviceId) toggleScenarioButtons(false);
      onError(error, current, scenarioView);
    });
  }

  function monitorSimulation(current, option) {
    watchPatient(option.dataset.patient, current, {
      alertsView: $('#simulation-alerts'), scenarioView: $('#simulation-output'), deviceId: option.value
    });
  }

  async function startScenario(scenario) {
    const current = scope;
    const option = $('#simulation-device')?.selectedOptions[0];
    if (!option) return;
    selectedDevice = option.value;
    stopUpdates();
    toggleScenarioButtons(true);
    const output = $('#simulation-output');
    output.innerHTML = careState('Starting scenario…');
    try {
      await api.startSimulation(option.dataset.patient, option.value, scenario, current.signal);
      if (scope !== current) return;
      monitorSimulation(current, option);
    } catch (error) {
      if (scope === current) toggleScenarioButtons(false);
      onError(error, current, output);
    }
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-care-retry')) render();
    if (button.dataset.scenario) startScenario(button.dataset.scenario);
  }

  function change(event) {
    if (event.target.id !== 'simulation-device') return;
    selectedDevice = event.target.value;
    render();
  }

  async function acknowledge(event) {
    const form = event.target;
    const alertId = form.dataset.ackAlert;
    if (!alertId || !activePatient) return;
    event.preventDefault();
    const current = scope;
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    try {
      await api.acknowledge(activePatient, alertId, new FormData(form).get('note'), current.signal);
      if (scope === current) await render();
    } catch (error) {
      if (scope !== current) return;
      if (error.code === 'SESSION_EXPIRED') onSessionExpired(error.message);
      else {
        const output = document.createElement('p');
        output.setAttribute('role', 'alert');
        output.textContent = error.message;
        form.querySelector('[role="alert"]')?.remove();
        form.append(output);
        button.disabled = false;
      }
    }
  }

  const logoutButtons = [...workspace.querySelectorAll('[data-logout]')];
  async function signOut() {
    logoutButtons.forEach(button => { button.disabled = true; });
    try { await onSignOut(); }
    catch (error) {
      const notice = $('#toast');
      notice.textContent = error.message;
      notice.hidden = false;
    } finally { logoutButtons.forEach(button => { button.disabled = false; }); }
  }

  logoutButtons.forEach(button => button.addEventListener('click', signOut));
  view.addEventListener('click', click);
  view.addEventListener('change', change);
  view.addEventListener('submit', acknowledge);
  window.addEventListener('hashchange', render);
  if (!location.hash || location.hash === '#login') window.history.replaceState(null, '', '#patients');
  $('#main-content').focus();
  render();
  return {
    dispose() {
      stopUpdates();
      scope?.abort();
      scope = null;
      stopConnectivity();
      window.removeEventListener('hashchange', render);
      view.removeEventListener('click', click);
      view.removeEventListener('change', change);
      view.removeEventListener('submit', acknowledge);
      logoutButtons.forEach(button => button.removeEventListener('click', signOut));
      view.replaceChildren();
      workspace.hidden = true;
      $('#profile-name').textContent = '';
      $('#profile-initials').textContent = '';
      $('#profile-role').textContent = '';
      $('#toast').hidden = true;
      $('#toast').textContent = '';
    }
  };
}
