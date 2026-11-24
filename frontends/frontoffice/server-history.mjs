import { createMeasurementsAdapter, normalizeMeasurements } from './measurements-adapter.mjs';
import { mountHistory } from './history.mjs';
import { mountConnectivity } from '../shared/connectivity.mjs';
import { createCareApi } from '../shared/care-api.mjs';
import { careState, connectedAlerts, panelMarkup } from '../shared/connected-views.mjs';
import { scenarioResult } from '../shared/scenario-view.mjs';
import { pollCare } from '../shared/poll-care.mjs';
import { escapeHTML as h } from '../shared/ui.mjs';

// The shared portal owns login/logout and the cookie session. This mount only owns the patient view.
export function mountServerHistory({ session, apiBaseUrl, onSignOut, onSessionExpired }) {
  if (session.role !== 'patient') throw new Error('Patient history requires a patient session.');
  const $ = selector => document.querySelector(selector);
  const api = createCareApi(apiBaseUrl, session);
  const shell = $('#app-shell');
  const view = $('#view-history');
  const controller = mountHistory(view, {
    adapter: createMeasurementsAdapter({ apiBaseUrl }), onSessionExpired
  });
  const views = {
    dashboard: { title: 'Tableau de bord', label: 'Tableau de bord', description: 'Vos alertes et les nouvelles mesures de votre appareil.' },
    history: { title: 'Tout l’historique', label: 'Historique', description: 'Your heart rate and blood oxygen over time.' },
    alerts: { title: 'Your alerts', label: 'Alerts', description: 'Episodes confirmed by the SmartCare rule detector.' },
    device: { title: 'Your devices', label: 'Device', description: 'Sensors assigned to your account.' }
  };
  let pending;
  const stopConnectivity = mountConnectivity($('#connectivity-notice'), { connected: true });
  $('#welcome-screen').hidden = true;
  shell.hidden = false;
  document.querySelector('.skip-link').href = '#main-content';
  for (const link of shell.querySelectorAll('[data-route]')) {
    link.hidden = !Object.hasOwn(views, link.dataset.route);
  }
  const name = session.displayName || session.userId;
  shell.querySelector('.profile strong').textContent = name;
  shell.querySelector('.profile small').textContent = 'Patient';
  for (const avatar of shell.querySelectorAll('.avatar')) {
    avatar.textContent = name.split(' ').slice(0, 2).map(part => part[0]).join('').toUpperCase();
    avatar.setAttribute('aria-label', name);
  }
  const buttons = [$('#logout'), $('#mobile-logout')];
  for (const button of buttons) button.lastChild.textContent = 'Sign out';
  async function signOut() {
    buttons.forEach(button => { button.disabled = true; });
    try { await onSignOut(); }
    catch (error) { $('#status-notice').textContent = error.message; $('#status-notice').hidden = false; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  }
  buttons.forEach(button => button.addEventListener('click', signOut));

  function showError(error, current, target) {
    if (current !== pending || current.signal.aborted) return;
    if (error.code === 'SESSION_EXPIRED') onSessionExpired(error.message);
    else target.innerHTML = careState(error.message, { retry: true });
  }

  function watchDashboard(target, current) {
    target.innerHTML = '<div data-dashboard-alerts aria-live="polite"></div>' +
      '<div data-dashboard-scenario>' + careState('Chargement…') + '</div>';
    const alertsView = target.querySelector('[data-dashboard-alerts]');
    const scenarioView = target.querySelector('[data-dashboard-scenario]');
    let lastAlerts, lastScenario;
    pollCare(current.signal, signal => Promise.all([api.myAlerts(signal), api.myLatestSimulation(signal)]),
      ([alerts, run]) => {
        const alertsHtml = connectedAlerts(alerts, { patient: true });
        const snapshot = run ? { ...run, rows: normalizeMeasurements(run.measurements) } : null;
        const scenarioHtml = scenarioResult(snapshot, { patient: true });
        if (alertsHtml !== lastAlerts) alertsView.innerHTML = lastAlerts = alertsHtml;
        if (scenarioHtml !== lastScenario) scenarioView.innerHTML = lastScenario = scenarioHtml;
      },
      error => {
        lastAlerts = lastScenario = undefined;
        alertsView.replaceChildren();
        showError(error, current, scenarioView);
      });
  }

  async function navigate() {
    pending?.abort();
    const current = pending = new AbortController();
    const hash = location.hash.slice(1);
    const route = Object.hasOwn(views, hash) ? hash : 'dashboard';
    if (hash !== route) window.history.replaceState(null, '', '#dashboard');
    const info = views[route];
    $('#page-eyebrow').textContent = 'PATIENT PORTAL';
    $('#page-title').textContent = info.title;
    $('#page-description').textContent = info.description;
    $('#breadcrumb-current').textContent = info.label;
    const target = $('#view-' + route);
    for (const item of shell.querySelectorAll('.view')) item.hidden = item !== target;
    for (const link of shell.querySelectorAll('[data-route]')) {
      const active = link.dataset.route === route;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (route === 'history') {
      await controller.load();
      return;
    }
    if (route === 'dashboard') {
      watchDashboard(target, current);
      return;
    }
    target.innerHTML = careState('Loading from SmartCare…');
    if (route === 'alerts') {
      let last;
      pollCare(current.signal, api.myAlerts, alerts => {
        const markup = connectedAlerts(alerts, { patient: true });
        if (last !== markup) target.innerHTML = last = markup;
      }, error => {
        last = undefined;
        showError(error, current, target);
      });
      return;
    }
    try {
      const devices = await api.myDevices(current.signal);
      if (current === pending) target.innerHTML = panelMarkup('Assigned sensors', 'Registered to your account.',
        devices.length ? '<dl class="full-details">' + devices.map(device =>
          '<div><dt>Device identifier</dt><dd>' + h(device.deviceId) + '</dd></div>').join('') +
          '</dl>' : careState('No devices are assigned to your account.'));
    } catch (error) {
      showError(error, current, target);
    }
  }
  const retry = event => { if (event.target.closest('[data-care-retry]')) navigate(); };
  shell.addEventListener('click', retry);
  window.addEventListener('hashchange', navigate);
  navigate();
  $('#status-notice').hidden = true;
  $('#main-content').focus();
  return {
    dispose() {
      pending?.abort();
      pending = null;
      controller.dispose();
      stopConnectivity();
      buttons.forEach(button => button.removeEventListener('click', signOut));
      window.removeEventListener('hashchange', navigate);
      shell.removeEventListener('click', retry);
      shell.hidden = true;
      shell.querySelector('.profile strong').textContent = '';
      shell.querySelector('.profile small').textContent = '';
      shell.querySelectorAll('.avatar').forEach(avatar => { avatar.textContent = ''; avatar.removeAttribute('aria-label'); });
      $('#view-dashboard').replaceChildren();
      $('#view-alerts').replaceChildren();
      $('#view-device').replaceChildren();
      $('#status-notice').textContent = ''; $('#status-notice').hidden = true;
    }
  };
}
