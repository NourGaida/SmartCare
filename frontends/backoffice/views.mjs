import { escapeHTML as h, chip, formatTime as time, chartMarkup } from '../shared/ui.mjs';
import { isStale } from '../shared/domain.mjs';

const empty = text => '<div class="empty-list" role="status">' + h(text) + '</div>';
const button = (text, attrs = '') => '<button class="button button-outline" ' + attrs + '>' + h(text) + '</button>';
const options = (items, selected = '') => items.map(item => '<option value="' + h(item.value) + '"' +
  (String(selected) === String(item.value) ? ' selected' : '') + '>' + h(item.label) + '</option>').join('');
const registryOptions = items => items.map(item => ({ value: item.id, label: item.name || item.label || item.id }));
const select = (name, label, items, selected = '') => '<label>' + h(label) + '<select name="' + h(name) + '">' + options(items, selected) + '</select></label>';
const field = (name, label, type = 'text', attrs = '') => '<label>' + h(label) +
  '<input name="' + h(name) + '" type="' + type + '" required ' + attrs + '></label>';
const table = (headings, rows, message = 'No items in this demonstration list.') =>
  rows.length ? '<div class="table-scroll"><table><thead><tr>' +
  headings.map(title => '<th scope="col">' + h(title) + '</th>').join('') +
  '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : empty(message);
const panel = (title, description, content) => '<article class="panel"><div class="panel-header"><div><h2>' +
  h(title) + '</h2><p>' + h(description) + '</p></div></div>' + content + '</article>';
const row = cells => '<tr>' + cells.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
const connection = latest => !latest ? 'Unavailable' : isStale(latest.timestamp) ? 'Disconnected · data outdated' : 'Connected';
const connectionChip = latest => '<span class="status-chip' + (isStale(latest?.timestamp) ? ' warning' : '') +
  '" data-connection="' + h(latest?.timestamp ?? '') + '">' + h(connection(latest)) + '</span>';
const quality = latest => !latest ? 'Unavailable' : latest.quality === 'good' ? 'Good signal' : 'Invalid · no finger';
const freshness = latest => '<p class="freshness' + (!latest || isStale(latest.timestamp) ? ' stale' : '') +
  '" data-freshness="' + h(latest?.timestamp ?? '') + '">' +
  h(!latest ? 'No current measurements' : (isStale(latest.timestamp) ? 'Data outdated · ' : 'Updated · ') + time(latest.timestamp)) + '</p>';
const ageCell = latest => '<time>' + h(time(latest?.timestamp)) + '</time>' + freshness(latest);
const alertLink = id => '#alert/' + encodeURIComponent(id);

export function patientCards(patients, query = '', status = 'all') {
  const term = query.trim().toLowerCase();
  const filtered = patients.filter(patient =>
    (patient.name + ' ' + patient.id + ' ' + patient.code).toLowerCase().includes(term) &&
    (status === 'all' || (status === 'stale' ? isStale(patient.latest?.timestamp)
      : status === 'invalid' ? patient.latest?.quality !== 'good' : !isStale(patient.latest?.timestamp))));
  if (!filtered.length) return empty('No assigned patients match these filters.');
  return '<div class="patients-grid">' + filtered.map(patient =>
    '<article class="panel patient-card"><div class="patient-card-header"><div><h2>' + h(patient.name) +
    '</h2><span class="patient-code">' + h(patient.code + ' · ' + patient.id) +
    '</span></div><span class="patient-avatar" aria-hidden="true">' + h(patient.name.split(' ').map(word => word[0]).join('')) +
    '</span></div><div class="patient-values"><div><small>Heart rate</small><strong>' +
    h(patient.latest?.hr ?? '—') + '</strong> <span class="unit">bpm</span></div><div><small>Blood oxygen</small><strong>' +
    h(patient.latest?.spo2 ?? '—') + '</strong> <span class="unit">%</span></div></div>' +
    '<dl><div><dt>Signal quality</dt><dd>' + chip(quality(patient.latest), patient.latest?.quality !== 'good') +
    '</dd></div><div><dt>Connection</dt><dd>' + connectionChip(patient.latest) +
    '</dd></div><div><dt>Last measure</dt><dd>' + ageCell(patient.latest) +
    '</dd></div><div><dt>Open episodes</dt><dd>' + patient.openAlerts + ' · ' + patient.needsAcknowledgement +
    ' to review</dd></div></dl><a class="button button-primary" href="#patient/' +
    encodeURIComponent(patient.id) + '">View details<span class="sr-only"> for ' + h(patient.name) +
    '</span></a></article>').join('') + '</div>';
}

export function patientsView(patients) {
  const open = patients.reduce((sum, patient) => sum + patient.openAlerts, 0);
  return '<div class="patient-summary">' +
    [[patients.length, 'Assigned patients'], [patients.filter(patient => !isStale(patient.latest?.timestamp)).length, 'Connected devices'], [open, 'Open alert episodes']]
      .map(([value, label]) => '<article class="summary-card"><strong' + (label === 'Connected devices' ? ' data-connected-count' : '') + '>' + value + '</strong><span>' + label + '</span></article>').join('') +
    '</div><div class="filter-bar"><label>Search patients<input id="patient-search" type="search" placeholder="Name or fictional ID" maxlength="100"></label>' +
    '<label>Patient state<select id="patient-state">' + options([
      { value: 'all', label: 'All states' }, { value: 'connected', label: 'Connected' },
      { value: 'stale', label: 'Disconnected / outdated' }, { value: 'invalid', label: 'Invalid signal' }
    ]) + '</select></label></div><div id="patient-results">' + patientCards(patients) +
    '</div><p class="access-check">Only your assigned patients are available. ' +
    '<a href="#patient/patient-004">Test unassigned patient access</a>.</p>';
}

export function readingsTable(readings) {
  return table(['Date & time', 'Heart rate', 'Blood oxygen', 'Signal quality', 'Source'],
    readings.map(reading => row([h(time(reading.timestamp)), h(reading.hr == null ? '—' : reading.hr + ' bpm'),
      h(reading.spo2 == null ? '—' : reading.spo2 + '%'), chip(quality(reading), reading.quality !== 'good'),
      h(reading.source)])), 'No readings match this selection.');
}

const timeRanges = [{ value: '15', label: 'Last 15 minutes' }, { value: '60', label: 'Last hour' }, { value: 'all', label: 'All demo readings' }];
const qualityOptions = [{ value: 'all', label: 'All signals' }, { value: 'good', label: 'Good signal' }, { value: 'invalid', label: 'Invalid signal' }];

export function patientView(patient, chartRows, history, alerts, filters) {
  const current = panel('Current measurements', patient.code + ' · ' + patient.group + ' · Fictional patient',
    '<div class="detail-values"><div><small>Heart rate · bpm</small><strong>' + h(patient.latest?.hr ?? '—') +
    '</strong></div><div><small>Blood oxygen · %</small><strong>' + h(patient.latest?.spo2 ?? '—') +
    '</strong></div></div><div class="inline-message">' + chip(quality(patient.latest), patient.latest?.quality !== 'good') +
    ' ' + connectionChip(patient.latest) + freshness(patient.latest) + '</div>');
  const chart = panel(filters.metric === 'hr' ? 'Heart rate over time · bpm' : 'Blood oxygen over time · %',
    'Missing and invalid samples appear as gaps.',
    chartMarkup(chartRows, filters.metric, filters.end, filters.minutes === 'all' ? 60 : Number(filters.minutes)));
  return '<a class="back-link" href="#patients">← Back to assigned patients</a>' +
    '<form class="filter-bar" data-action="history-filters">' +
    select('minutes', 'Time range', timeRanges, filters.minutes) +
    select('quality', 'Signal quality', qualityOptions, filters.quality) +
    select('metric', 'Chart measurement', [{ value: 'hr', label: 'Heart rate' }, { value: 'spo2', label: 'Blood oxygen' }], filters.metric) +
    '<button class="button button-primary">Apply filters</button>' + button('Export selected CSV', 'type="button" data-export') +
    '</form><div class="detail-grid">' + current + chart + '</div><div class="stack">' +
    panel('Measurement history', history.total + ' selected readings · snapshot ' + time(filters.end),
      readingsTable(history.rows) + '<div class="pagination"><span>Page ' + history.page + ' of ' + history.pages +
      '</span><div>' + button('Previous', 'data-page="' + (history.page - 1) + '"' + (history.page <= 1 ? ' disabled' : '')) +
      button('Next', 'data-page="' + (history.page + 1) + '"' + (history.page >= history.pages ? ' disabled' : '')) + '</div></div>') +
    panel('Patient alerts', 'Acknowledgement does not resolve an episode.', alertsTable(alerts)) + '</div>';
}

export function alertsTable(alerts, patients = []) {
  return table(['Patient', 'Episode', 'State', 'Started', 'Action'], alerts.map(alert =>
    row([h(patients.find(patient => patient.id === alert.patientId)?.name || alert.patientId), h(alert.title),
      chip(alert.state, alert.state === 'open'), h(time(alert.startedAt)),
      '<a class="button button-outline" href="' + alertLink(alert.id) + '">View details<span class="sr-only"> for ' + h(alert.id) + '</span></a>'])),
  'No alerts match these filters.');
}

export function alertsView(alerts, patients, filters) {
  return '<form class="filter-bar" data-action="alert-filters">' +
    select('patientId', 'Patient', [{ value: '', label: 'All assigned patients' }, ...registryOptions(patients)], filters.patientId) +
    select('state', 'Episode state', ['all', 'open', 'acknowledged', 'resolved'].map(value => ({ value, label: value === 'all' ? 'All states' : value })), filters.state) +
    '<button class="button button-primary">Apply filters</button></form>' +
    panel('Alert episodes', alerts.filter(alert => alert.state === 'open').length + ' need acknowledgement in this selection. Acknowledged episodes remain open until resolved.', alertsTable(alerts, patients));
}

export function alertView(alert) {
  const details = '<div class="alert-details"><dl>' + [
    ['Episode', alert.id], ['Patient', alert.patientId], ['State', alert.state],
    ['Source', alert.source || 'Not supplied'], ['Reason', alert.reason || 'Not supplied'],
    ['Period', time(alert.startedAt) + ' – ' + (alert.endedAt ? time(alert.endedAt) : 'ongoing')],
    ['Rule version', alert.ruleVersion || 'Not supplied']
  ].map(([title, value]) => '<dt>' + h(title) + '</dt><dd>' + h(value) + '</dd>').join('') +
    (alert.acknowledgedAt ? '<dt>Acknowledged by</dt><dd>' + h(alert.acknowledgedBy) + ' · ' +
      h(time(alert.acknowledgedAt)) + '</dd><dt>Note</dt><dd>' + h(alert.note) + '</dd>' : '') + '</dl>' +
    (alert.state === 'open' ? '<form data-action="acknowledge"><label for="ack-note">Acknowledgement note (required)</label>' +
      '<textarea id="ack-note" name="note" required maxlength="500"></textarea><button class="button button-primary">Acknowledge episode</button></form>' :
      '<p class="inline-message">' + h(alert.state === 'acknowledged' ? 'Reviewed. This episode has not been automatically resolved.' : 'This episode is resolved; acknowledgement is unavailable.') + '</p>') +
    '<h3>Associated measurements</h3>' + readingsTable(alert.measurements || []) + '</div>';
  return '<a class="back-link" href="#alerts">← Back to alerts</a>' +
    panel(alert.title, 'Demonstration only. These values are not medical recommendations.', details);
}

const roles = ['patient', 'professional', 'administrator'].map(value => ({ value, label: value }));

export function accountsView(accounts) {
  return panel('Demo accounts', 'Creation and changes apply only to this administrator session.',
    '<form class="form-grid" data-action="create-account">' + field('name', 'Display name', 'text', 'maxlength="80"') +
    field('email', 'Email address', 'email', 'maxlength="120"') + select('role', 'Role', roles, 'professional') +
    '<button class="button button-primary">Create demo account</button></form>' +
    table(['Account', 'Email', 'Role', 'Status', 'Action'], accounts.map(account => row([
      h(account.name), h(account.email),
      '<label class="sr-only" for="role-' + h(account.id) + '">Role for ' + h(account.name) + '</label><select class="inline-select" id="role-' + h(account.id) +
      '" data-account-role="' + h(account.id) + '">' + options(roles, account.role) + '</select>',
      chip(account.active ? 'Active' : 'Inactive', !account.active),
      button(account.active ? 'Deactivate' : 'Activate', 'data-toggle-account="' + h(account.id) + '" data-active="' + !account.active + '"')
    ]))));
}

export function assignmentsView(data) {
  return panel('Patient assignments', 'Registry information only. No physiological data is available to administrators.',
    '<form class="form-grid" data-action="assign-patient">' + select('patientId', 'Patient', registryOptions(data.patients)) +
    select('professionalId', 'Professional', registryOptions(data.professionals)) +
    '<button class="button button-primary">Assign patient</button></form>' +
    table(['Patient', 'Professional', 'Action'], data.assignments.map(item => row([
      h(data.patients.find(patient => patient.id === item.patientId)?.name || item.patientId),
      h(data.professionals.find(account => account.id === item.professionalId)?.name || item.professionalId),
      button('Remove assignment', 'data-remove-patient="' + h(item.patientId) + '" data-professional="' + h(item.professionalId) + '"')
    ]))));
}

export function devicesView(data) {
  return panel('Registered devices', 'Assignments and revocations are simulated. No device is contacted.',
    '<form class="form-grid" data-action="register-device">' + field('id', 'Device identifier', 'text', 'pattern="[a-zA-Z0-9_-]{1,60}" maxlength="60"') +
    field('label', 'Device label', 'text', 'maxlength="80"') + '<button class="button button-primary">Register demo device</button></form>' +
    '<form class="form-grid" data-action="assign-device">' +
    select('deviceId', 'Active device', registryOptions(data.devices.filter(device => device.status === 'active'))) +
    select('patientId', 'Patient', registryOptions(data.patients)) +
    '<button class="button button-primary">Assign device</button></form>' +
    table(['Device', 'Label', 'Assigned patient', 'Status', 'Action'], data.devices.map(device => row([
      h(device.id), h(device.label), h(data.patients.find(patient => patient.id === device.patientId)?.name || 'Unassigned'),
      chip(device.status, device.status !== 'active'),
      button('Revoke device', 'data-revoke-device="' + h(device.id) + '"' + (device.status === 'revoked' ? ' disabled' : ''))
    ]))));
}

export function servicesView(services) {
  return '<div class="notice"><strong>Simulated availability</strong>No health request or live monitoring is performed.</div>' +
    (services.length ? '<div class="service-grid">' + services.map(service =>
      '<article class="panel service-card"><h2>' + h(service.name) + '</h2>' +
      chip(service.available ? 'Available · simulated' : 'Unavailable · simulated', !service.available) +
      '<p>Last demonstration check<br>' + h(time(service.checkedAt)) + '</p></article>').join('') + '</div>' : empty('No services in this demonstration list.'));
}

export function modelView(model) {
  return panel('Model service', 'All availability, version and mode values on this screen are simulated.',
    '<dl class="full-details"><div><dt>Availability</dt><dd>' + chip(model.available ? 'Available · simulated' : 'Unavailable · simulated', !model.available) +
    '</dd></div><div><dt>Version</dt><dd>' + h(model.version || 'Not supplied') +
    '</dd></div><div><dt>Mode</dt><dd>' + h(model.mode || 'Not supplied') +
    '</dd></div><div><dt>Last demonstration check</dt><dd>' + h(time(model.checkedAt)) + '</dd></div></dl>');
}

export function stateView(title, message) {
  return '<article class="panel state-card"><h2>' + h(title) + '</h2><p>' + h(message) +
    '</p>' + button('Reload normal demo data', 'data-retry') + '</article>';
}
