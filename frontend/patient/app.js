// SmartCare patient interface. All readings are synthetic and held in memory.
import { createPatientAdapter } from './adapter.mjs';
import { DEMO_ACCOUNTS } from '../shared/auth.mjs';
import { chartSegments, isStale, readingsCSV } from '../shared/domain.mjs';
const adapter = createPatientAdapter();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const fullTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const now = Date.now();
const state = { route: 'dashboard', range: '15', metric: 'hr', scenario: 'normal', paused: false, inDemo: false, lastReceived: now, page: 1, pageSize: 10, historySnapshot: now, alerts: [], data: [] };
const labels = {
  dashboard: ['YOUR DAILY OVERVIEW', 'My dashboard', 'Your latest readings, all in one place.', 'Overview'],
  history: ['YOUR MEASUREMENTS', 'Reading history', 'A little perspective on your recent readings.', 'History'],
  alerts: ['STAY INFORMED', 'My alerts', 'Updates and alerts, together in one place.', 'Alerts'],
  device: ['YOUR CONNECTION', 'My device', 'Keep an eye on your sensor and its connection.', 'Device']
};
function navigate() {
  if (!state.inDemo) return;
  const route = location.hash.slice(1);
  state.route = Object.hasOwn(labels, route) ? route : 'dashboard';
  if (route !== state.route) history.replaceState(null, '', '#dashboard');
  const [eyebrow, title, description, breadcrumb] = labels[state.route];
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').textContent = title;
  $('#page-description').textContent = description;
  $('#breadcrumb-current').textContent = breadcrumb;
  $$('.view').forEach(view => { view.hidden = view.id !== `view-${state.route}`; });
  $$('[data-route]').forEach(link => { const selected = link.dataset.route === state.route; link.classList.toggle('active', selected); selected ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'); });
  if (state.route === 'history') { state.historySnapshot = Date.now(); state.page = 1; renderHistory(); }
  if (state.route === 'alerts') renderAlerts();
  renderReadings();
}
function secondsAgo() { return Math.max(0, Math.floor((Date.now() - state.lastReceived) / 1000)); }
function ageLabel() { const age = secondsAgo(); return age < 1 ? 'Just now' : age < 60 ? `${age} second${age === 1 ? '' : 's'} ago` : `${Math.floor(age / 60)} min ago`; }
function rangeStart(range, end = Date.now()) {
  if (range === 'all') return 0;
  if (range === 'today') { const start = new Date(end); start.setHours(0, 0, 0, 0); return start.getTime(); }
  return end - Number(range) * 60 * 1000;
}
function chartRows() { const end = Date.now(); return state.data.filter(row => row.timestamp >= rangeStart(state.range, end) && row.timestamp <= end); }
function historyRows() {
  const start = rangeStart($('#history-range').value, state.historySnapshot);
  const quality = $('#history-quality').value;
  return state.data.filter(row => row.timestamp >= start && row.timestamp <= state.historySnapshot && (quality === 'all' || row.quality === quality)).slice().reverse();
}
function renderReadings() {
  if (!state.inDemo) return;
  const latest = state.data.at(-1);
  const stale = isStale(state.lastReceived);
  const poor = state.scenario === 'poor';
  $('#heart-value').textContent = latest?.hr ?? '—';
  $('#oxygen-value').textContent = latest?.spo2 ?? '—';
  $('#quality-value').textContent = !latest ? 'Unavailable' : stale ? 'Offline' : poor ? 'Poor' : 'Good';
  $('#quality-description').innerHTML = `<span class="tiny-dot ${poor || stale ? 'rose-dot' : 'green-dot'}"></span>${stale ? 'No recent data received' : poor ? 'Reading unavailable · low quality' : 'Clear signal from your device'}`;
  $$('.metric-card .metric-footer').slice(0, 2).forEach(footer => {
    footer.lastChild.textContent = !latest ? 'No current readings' : poor ? 'Current reading unavailable' : stale ? 'Last reading · data outdated' : 'Latest valid reading';
  });
  $('#app-shell').classList.toggle('bad-signal', poor);
  $('#app-shell').classList.toggle('offline', stale);
  $('#last-update').textContent = `Updated ${ageLabel().toLowerCase()}`;
  $('#device-last-received').textContent = ageLabel();
  $('#device-quality').textContent = stale ? 'Unavailable' : poor ? 'Poor' : 'Good';
  $('#device-connection').innerHTML = `<span class="tiny-dot ${stale ? 'rose-dot' : 'green-dot'}"></span>${stale ? 'Disconnected' : 'Connected'}`;
  $('#device-page-status').textContent = stale ? 'Disconnected' : 'Connected';
  $('#device-page-status').classList.toggle('warning', stale);
  $('#live-label').innerHTML = `<span class="live-dot"${stale || state.paused ? ' style="background:#a8b6c2"' : ''}></span>${stale ? 'Data outdated' : state.paused ? 'Demo paused' : 'Live readings'}`;
  const notice = $('#status-notice');
  if (['empty', 'error', 'loading'].includes(state.scenario)) {
    notice.hidden = false;
    const message = state.scenario === 'error' ? 'Demo data could not be loaded.' : state.scenario === 'loading' ? 'Loading demo readings…' : 'No demo readings are available.';
    if (notice.dataset.scenario !== state.scenario) {
      notice.innerHTML = message + ' <button class="button button-outline" id="retry-demo">Reload demo data</button>';
    }
    $('#quality-description').textContent = 'No current signal available';
    $('#device-quality').textContent = 'Unavailable';
    $('#device-connection').textContent = 'Unavailable · demonstration';
    $('#device-page-status').textContent = 'Unavailable';
    $('#live-label').textContent = message;
  }
  else if (stale) { notice.hidden = false; notice.textContent = 'No new readings for 30 seconds or more. The displayed measurements are outdated. Check the device connection or resume the demo.'; }
  else if (poor) { notice.hidden = false; notice.textContent = 'The sensor signal is poor. New measurements are marked as invalid and appear as gaps in the chart.'; }
  else if (state.paused) { notice.hidden = false; notice.textContent = 'Demo stream paused. Existing data stays visible; after 30 seconds it will be marked as outdated.'; }
  else notice.hidden = true;
  notice.dataset.scenario = state.scenario;
  const paused = state.paused || state.scenario === 'offline';
  $('#stream-toggle').setAttribute('aria-pressed', String(paused));
  $('#stream-toggle span').textContent = paused ? 'Resume demo' : 'Pause demo';
  $('#stream-toggle use').setAttribute('href', paused ? '#i-play' : '#i-pause');
  if (state.route === 'dashboard') renderChart();
}
function renderChart() {
  const rows = chartRows();
  const metric = state.metric;
  const chart = $('#reading-chart');
  const values = rows.filter(row => row.quality === 'good' && Number.isFinite(row[metric])).map(row => row[metric]);
  const bounds = metric === 'hr' ? [40, 120] : [90, 100];
  const min = values.length ? Math.min(bounds[0], Math.floor(Math.min(...values) / 5) * 5) : bounds[0];
  const max = values.length ? Math.max(bounds[1], Math.ceil(Math.max(...values) / 5) * 5) : bounds[1];
  const x0 = 49, x1 = 677, y0 = 23, y1 = 239;
  const end = Date.now();
  // Keep the full selected interval visible, even when only part of it has readings.
  const start = rangeStart(state.range, end);
  const x = timestamp => x0 + (timestamp - start) / Math.max(1, end - start) * (x1 - x0);
  const y = value => y1 - (value - min) / (max - min) * (y1 - y0);
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const yy = y0 + i * (y1 - y0) / 4;
    grid += `<line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}" stroke="#eaf0f4"/><text x="${x0 - 14}" y="${yy + 4}" text-anchor="end">${max - i * (max - min) / 4}</text>`;
  }
  for (let i = 0; i <= 5; i++) {
    const xx = x0 + i * (x1 - x0) / 5;
    grid += `<line x1="${xx}" x2="${xx}" y1="${y0}" y2="${y1}" stroke="#f1f5f7"/><text x="${xx}" y="${y1 + 26}" text-anchor="middle">${time.format(new Date(start + i * (end - start) / 5))}</text>`;
  }
  const segments = chartSegments(rows, metric);
  const color = metric === 'hr' ? '#00949b' : '#4b9fc6';
  const paths = segments.map(part => {
    // Aggregate only for rendering. Preserve extrema every 4 seconds; raw samples remain in history/export.
    const display = part.length > 1000 ? part.filter((_, i) => i % 3 === 0 || i === part.length - 1) : part;
    const line = display.map((row, i) => `${i === 0 ? 'M' : 'L'}${x(row.timestamp).toFixed(2)} ${y(row[metric]).toFixed(2)}`).join(' ');
    const fill = `${line} L${x(part.at(-1).timestamp).toFixed(2)} ${y1} L${x(part[0].timestamp).toFixed(2)} ${y1}Z`;
    return `<path d="${fill}" fill="url(#chart-fill)"/><path d="${line}" stroke="${color}" stroke-width="2" fill="none" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const last = segments.at(-1)?.at(-1);
  const point = last ? `<circle cx="${x(last.timestamp)}" cy="${y(last[metric])}" r="4" fill="${color}" stroke="white" stroke-width="2"/>` : '';
  chart.innerHTML = `<defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".14"/><stop offset="100%" stop-color="${color}" stop-opacity=".01"/></linearGradient></defs>${grid}${paths}${point}<line id="chart-crosshair" x1="0" x2="0" y1="${y0}" y2="${y1}" stroke="#a4bdc3" stroke-dasharray="3 4" visibility="hidden"/><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="transparent"/>`;
  $('#chart-title').textContent = metric === 'hr' ? 'Heart rate over time' : 'Blood oxygen over time';
  $('#chart-unit').textContent = metric === 'hr' ? 'bpm' : 'SpO₂ (%)';
  $('#chart-summary').textContent = `${rows.length.toLocaleString('en-GB')} demo readings · ${rows.filter(row => row.quality !== 'good').length} invalid. Missing samples appear as gaps.`;
  chart.onpointermove = event => {
    if (!rows.length) return;
    const rect = chart.getBoundingClientRect();
    const pixel = (event.clientX - rect.left) / rect.width * 700;
    if (pixel < x0 || pixel > x1) { $('#chart-tooltip').hidden = true; return; }
    const timestamp = start + (pixel - x0) / (x1 - x0) * (end - start);
    // Binary search avoids scanning every sample on pointer movement.
    let lo = 0, hi = rows.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (rows[mid].timestamp < timestamp) lo = mid + 1; else hi = mid; }
    const row = rows[lo];
    const missing = Math.abs(row.timestamp - timestamp) > 1500;
    const tooltip = $('#chart-tooltip');
    tooltip.textContent = missing ? 'No data in this interval' : `${time.format(new Date(row.timestamp))} · ${row.quality === 'good' ? `${row[metric]} ${metric === 'hr' ? 'bpm' : '%'}` : 'Invalid · poor signal'}`;
    tooltip.hidden = false;
    const container = $('.chart-container').getBoundingClientRect();
    tooltip.style.left = `${Math.max(4, Math.min(event.clientX - container.left + 10, container.width - tooltip.offsetWidth - 7))}px`;
    tooltip.style.top = '18px';
    const crosshair = $('#chart-crosshair');
    crosshair.setAttribute('x1', pixel); crosshair.setAttribute('x2', pixel); crosshair.setAttribute('visibility', 'visible');
  };
  chart.onpointerleave = () => { $('#chart-tooltip').hidden = true; $('#chart-crosshair')?.setAttribute('visibility', 'hidden'); };
}
function renderHistory() {
  const rows = historyRows();
  const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.max(1, Math.min(state.page, pages));
  const offset = (state.page - 1) * state.pageSize;
  $('#history-body').innerHTML = rows.length ? rows.slice(offset, offset + state.pageSize).map(row => `<tr><td>${fullTime.format(new Date(row.timestamp))}</td><td>${row.hr == null ? '—' : `${row.hr} bpm`}</td><td>${row.spo2 == null ? '—' : `${row.spo2}%`}</td><td><span class="status-chip ${row.quality === 'good' ? '' : 'warning'}">${row.quality === 'good' ? 'Good signal' : 'Poor · invalid'}</span></td><td><span class="source-chip">DEMO</span></td></tr>`).join('') : '<tr><td colspan="5">No readings match these filters. Try another range or signal quality.</td></tr>';
  $('#history-total').textContent = `${rows.length.toLocaleString('en-GB')} readings · snapshot at ${time.format(new Date(state.historySnapshot))}`;
  $('#page-label').textContent = rows.length ? `${offset + 1}–${Math.min(offset + state.pageSize, rows.length)} of ${rows.length.toLocaleString('en-GB')}` : '0 readings';
  $('#previous-page').disabled = state.page <= 1;
  $('#next-page').disabled = state.page >= pages;
}
function renderAlerts() {
  const count = state.alerts.length;
  $('#nav-alert-count').hidden = count === 0;
  $('#nav-alert-count').textContent = count;
  $('#notification-dot').hidden = count === 0;
  if (!count) {
    $('#alert-list').innerHTML = '<div class="empty-alert large-empty"><span class="check-circle"><svg class="icon"><use href="#i-check"/></svg></span><strong>You’re all caught up</strong><p>No alerts in this demo session.<br>Use “Preview an alert” to explore the alert interface.</p></div>';
    $('#recent-alert-content').innerHTML = '<strong>No new alerts</strong><p>No alerts in this demo session.</p>';
    return;
  }
  $('#alert-list').innerHTML = state.alerts.slice().reverse().map(alert => `<article class="alert-row"><span class="scenario-icon amber"><svg class="icon"><use href="#i-bell"/></svg></span><div><h3>${alert.title}</h3><p>${fullTime.format(new Date(alert.timestamp))} · Demonstration only</p></div><span class="status-chip warning">Example</span><button class="button button-outline" data-alert-id="${alert.id}">View details</button></article>`).join('');
  $('#recent-alert-content').innerHTML = `<span class="check-circle" style="background:#fff3dd;color:#bb9555"><svg class="icon"><use href="#i-bell"/></svg></span><strong>${count} demo alert${count > 1 ? 's' : ''}</strong><p>A sample alert is available.<br>Open Alerts to view the details.</p>`;
}
function previewAlert() {
  if (state.alerts.length >= 5) { toast('Five examples are already available. Open an alert to view its details.'); return; }
  adapter.previewAlert();
  renderAlerts(); toast('Demo alert added. No real medical event was detected.');
}
function showAlert(id) {
  const alert = state.alerts.find(item => item.id === Number(id));
  if (!alert) return;
  $('#alert-dialog-content').innerHTML = '<span class="status-chip warning">Demonstration only</span><h3>' + alert.title + '</h3><p>Example episode. This is sample interface text, not medical advice.</p><dl><dt>Created</dt><dd>' + fullTime.format(new Date(alert.timestamp)) + '</dd><dt>State</dt><dd>' + alert.state + '</dd><dt>Source / reason</dt><dd>' + alert.source + ' / ' + alert.reason + '</dd><dt>Period</dt><dd>' + fullTime.format(new Date(alert.startedAt)) + ' – ongoing</dd><dt>Associated reading</dt><dd>Heart rate: unavailable · SpO₂: unavailable · quality: invalid</dd><dt>Rule version</dt><dd>' + alert.ruleVersion + '</dd></dl>';
  $('#alert-dialog').showModal();
}
let toastTimeout;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function exportCSV() {
  const rows = state.route === 'history' ? historyRows().slice().reverse() : chartRows();
  if (!rows.length) { toast('No readings to export for this selection.'); return; }
  const csv = readingsCSV(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `smartcare-demo-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${rows.length.toLocaleString('en-GB')} demo readings exported as CSV.`);
}
function addReading() { state.lastReceived = adapter.nextReading(state.scenario !== 'poor').timestamp; }
function setScenario(scenario) {
  state.scenario = scenario; state.paused = false;
  if (['empty', 'error', 'loading'].includes(scenario)) { state.data = []; state.paused = true; }
  else if (scenario === 'offline') { state.data = adapter.getReadings(); state.lastReceived = Date.now() - 31000; }
  else { state.data = adapter.getReadings(); addReading(); }
  renderReadings();
  if (state.route === 'history') renderHistory();
  const messages = {
    offline: 'Disconnected state previewed. Resume demo to reconnect.',
    poor: 'Poor signal selected. New samples are marked invalid.',
    empty: 'Empty readings preview. Reload demo data to recover.',
    error: 'Data error preview. Reload demo data to retry.',
    loading: 'Loading preview. Reload demo data to finish.',
    normal: 'Good signal restored. Demo readings are running.'
  };
  toast(messages[scenario]);
}
window.addEventListener('hashchange', navigate);
$('#alerts-shortcut').addEventListener('click', () => { location.hash = 'alerts'; });
$$('[data-range]').forEach(button => button.addEventListener('click', () => { state.range = button.dataset.range; $$('[data-range]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); }); renderChart(); }));
$$('[data-metric]').forEach(button => button.addEventListener('click', () => { state.metric = button.dataset.metric; $$('[data-metric]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); }); renderChart(); }));
$$('[data-export]').forEach(button => button.addEventListener('click', exportCSV));
$$('[data-scenario]').forEach(button => button.addEventListener('click', () => setScenario(button.dataset.scenario)));
$('#stream-toggle').addEventListener('click', () => { if (state.paused || state.scenario === 'offline') setScenario('normal'); else { state.paused = true; renderReadings(); } });
['#history-range', '#history-quality'].forEach(selector => $(selector).addEventListener('change', () => { state.page = 1; state.historySnapshot = Date.now(); renderHistory(); }));
$('#previous-page').addEventListener('click', () => { state.page--; renderHistory(); });
$('#next-page').addEventListener('click', () => { state.page++; renderHistory(); });
$('#demo-alert').addEventListener('click', previewAlert);
$('#alert-list').addEventListener('click', event => { const button = event.target.closest('[data-alert-id]'); if (button) showAlert(button.dataset.alertId); });
['#close-dialog', '#dialog-done'].forEach(selector => $(selector).addEventListener('click', () => $('#alert-dialog').close()));

function logout() {
  adapter.logout();
  state.inDemo = false; state.data = []; state.alerts = []; state.lastReceived = 0;
  clearTimeout(toastTimeout); $('#toast').hidden = true; $('#toast').textContent = '';
  $('#alert-dialog').close();
  ['#reading-chart', '#history-body', '#alert-dialog-content', '#chart-summary', '#page-label', '#history-total', '#chart-tooltip', '#status-notice', '#live-label', '#quality-description'].forEach(selector => { $(selector).textContent = ''; });
  $('#reading-chart').onpointermove = null; $('#reading-chart').onpointerleave = null;
  $('#chart-tooltip').hidden = true; $('#status-notice').dataset.scenario = '';
  ['#heart-value', '#oxygen-value', '#quality-value', '#last-update', '#device-last-received', '#device-quality', '#device-connection', '#device-page-status'].forEach(selector => { $(selector).textContent = '—'; });
  renderAlerts();
  $('#login-form').reset(); $('#login-error').textContent = '';
  history.replaceState(null, '', '#login');
  $('#app-shell').hidden = true; $('#welcome-screen').hidden = false;
  $('#enter-demo').focus();
}
$('#logout').addEventListener('click', logout);
$('#mobile-logout').addEventListener('click', logout);
$('#status-notice').addEventListener('click', event => { if (event.target.closest('#retry-demo')) setScenario('normal'); });
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  $('#login-submit').disabled = true; $('#login-error').textContent = 'Opening demo session…';
  try {
    await adapter.login({ email: $('#login-email').value, password: $('#login-password').value });
    state.data = adapter.getReadings(); state.alerts = adapter.getAlerts(); state.scenario = 'normal'; state.paused = false;
    state.lastReceived = Date.now(); state.historySnapshot = Date.now(); state.page = 1; state.range = '15'; state.metric = 'hr'; state.inDemo = true;
    $('#history-range').value = 'all'; $('#history-quality').value = 'all';
    $$('[data-range]').forEach(button => { const selected = button.dataset.range === '15'; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $$('[data-metric]').forEach(button => { const selected = button.dataset.metric === 'hr'; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    $('#app-shell').hidden = false; $('#welcome-screen').hidden = true;
    $('#login-form').reset(); $('#login-error').textContent = '';
    location.hash = 'dashboard'; renderAlerts(); navigate(); $('#main-content').focus();
  } catch (error) { $('#login-error').textContent = error.message; }
  finally { $('#login-submit').disabled = false; }
});
$('#enter-demo').addEventListener('click', () => {
  $('#login-email').value = DEMO_ACCOUNTS.patient.email;
  $('#login-password').value = DEMO_ACCOUNTS.patient.password;
  $('#login-form').requestSubmit();
});
$('#current-date').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
setInterval(() => { if (!state.inDemo) return; if (!state.paused && state.scenario !== 'offline') addReading(); renderReadings(); }, 1000);
navigate(); renderAlerts();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => { /* Browsing still works when installation is unavailable. */ });
