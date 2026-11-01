// SmartCare patient interface. All readings are synthetic and held in memory.
// Integration point: replace makeReading()/the timer with Person B's REST + WebSocket adapter.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const fullTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const now = Date.now();
const state = { route: 'dashboard', range: '15', metric: 'hr', scenario: 'normal', paused: false, inDemo: true, lastReceived: now, page: 1, pageSize: 10, historySnapshot: now, alerts: [], sequence: 3600, data: [] };
function makeReading(timestamp, sequence, valid = true) {
  const wave = Math.sin(sequence / 31) * 4 + Math.sin(sequence / 11) * 2.4 + Math.sin(sequence / 89) * 3.3;
  return { timestamp, hr: valid ? Math.round(78 + wave) : null, spo2: valid ? Math.round(97 + .6 * Math.sin(sequence / 71)) : null, quality: valid ? 'good' : 'poor', source: 'demo', sequence, deviceId: 'SC-DEMO-001' };
}
for (let i = 0; i <= 3600; i++) state.data.push(makeReading(now - (3600 - i) * 1000, i));
const labels = {
  dashboard: ['YOUR DAILY OVERVIEW', 'My dashboard', 'Your latest readings, all in one place.', 'Overview'],
  history: ['YOUR MEASUREMENTS', 'Reading history', 'A little perspective on your recent readings.', 'History'],
  alerts: ['STAY INFORMED', 'My alerts', 'Updates and alerts, together in one place.', 'Alerts'],
  device: ['YOUR CONNECTION', 'My device', 'Keep an eye on your sensor and its connection.', 'Device']
};
function navigate() {
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
  const stale = secondsAgo() > 30;
  const poor = state.scenario === 'poor';
  $('#heart-value').textContent = latest.hr ?? '—';
  $('#oxygen-value').textContent = latest.spo2 ?? '—';
  $('#quality-value').textContent = stale ? 'Offline' : poor ? 'Poor' : 'Good';
  $('#quality-description').innerHTML = `<span class="tiny-dot ${poor || stale ? 'rose-dot' : 'green-dot'}"></span>${stale ? 'No recent data received' : poor ? 'Reading unavailable · low quality' : 'Clear signal from your device'}`;
  $$('.metric-card .metric-footer').slice(0, 2).forEach(footer => {
    footer.lastChild.textContent = poor ? 'Current reading unavailable' : stale ? 'Last reading · data outdated' : 'Latest valid reading';
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
  if (stale) { notice.hidden = false; notice.textContent = 'No new readings for more than 30 seconds. The displayed measurements are outdated. Check the device connection or resume the demo.'; }
  else if (poor) { notice.hidden = false; notice.textContent = 'The sensor signal is poor. New measurements are marked as invalid and appear as gaps in the chart.'; }
  else if (state.paused) { notice.hidden = false; notice.textContent = 'Demo stream paused. Existing data stays visible; after 30 seconds it will be marked as outdated.'; }
  else notice.hidden = true;
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
  // Segment at poor-quality readings and at missing intervals >5 seconds.
  const segments = []; let segment = []; let previous = null;
  for (const row of rows) {
    if (row.quality !== 'good' || !Number.isFinite(row[metric])) { if (segment.length) segments.push(segment); segment = []; previous = null; continue; }
    if (previous && row.timestamp - previous.timestamp > 5000) { if (segment.length) segments.push(segment); segment = []; }
    segment.push(row); previous = row;
  }
  if (segment.length) segments.push(segment);
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
    const missing = Math.abs(row.timestamp - timestamp) > 5000;
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
    return;
  }
  $('#alert-list').innerHTML = state.alerts.slice().reverse().map(alert => `<article class="alert-row"><span class="scenario-icon amber"><svg class="icon"><use href="#i-bell"/></svg></span><div><h3>${alert.title}</h3><p>${fullTime.format(new Date(alert.timestamp))} · Demonstration only</p></div><span class="status-chip warning">Example</span><button class="button button-outline" data-alert-id="${alert.id}">View details</button></article>`).join('');
  $('#recent-alert-content').innerHTML = `<span class="check-circle" style="background:#fff3dd;color:#bb9555"><svg class="icon"><use href="#i-bell"/></svg></span><strong>${count} demo alert${count > 1 ? 's' : ''}</strong><p>A sample alert is available.<br>Open Alerts to view the details.</p>`;
}
function previewAlert() {
  if (state.alerts.length >= 5) { toast('Five examples are already available. Open an alert to view its details.'); return; }
  state.alerts.push({ id: state.alerts.length + 1, timestamp: Date.now(), title: 'Signal quality needs attention' });
  renderAlerts(); toast('Demo alert added. No real medical event was detected.');
}
function showAlert(id) {
  const alert = state.alerts.find(item => item.id === Number(id));
  if (!alert) return;
  $('#alert-dialog-content').innerHTML = `<span class="status-chip warning">UI example · not a clinical alert</span><h3>${alert.title}</h3><p>This example shows how the patient app presents an alert. In the connected application, your server supplies the reason, episode status, evidence and rule version.</p><dl><dt>Created</dt><dd>${fullTime.format(new Date(alert.timestamp))}</dd><dt>Source</dt><dd>Manual demo control</dd><dt>Example guidance</dt><dd>Check that the sensor is positioned correctly. This is sample interface text, not medical advice.</dd></dl>`;
  $('#alert-dialog').showModal();
}
let toastTimeout;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function exportCSV() {
  const rows = state.route === 'history' ? historyRows().slice().reverse() : chartRows();
  if (!rows.length) { toast('No readings to export for this selection.'); return; }
  const csv = ['timestamp_utc,device_id,heart_rate_bpm,spo2_percent,quality,source', ...rows.map(row => `${new Date(row.timestamp).toISOString()},${row.deviceId},${row.hr ?? ''},${row.spo2 ?? ''},${row.quality},${row.source}`)].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `smartcare-demo-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${rows.length.toLocaleString('en-GB')} demo readings exported as CSV.`);
}
function addReading() { state.sequence++; state.lastReceived = Date.now(); state.data.push(makeReading(state.lastReceived, state.sequence, state.scenario !== 'poor')); if (state.data.length > 86400) state.data.shift(); }
function setScenario(scenario) {
  state.scenario = scenario; state.paused = false;
  if (scenario === 'offline') state.lastReceived = Date.now() - 31000;
  else addReading();
  renderReadings();
  toast(scenario === 'offline' ? 'Disconnected state previewed. Resume demo to reconnect.' : scenario === 'poor' ? 'Poor signal selected. New samples are marked invalid.' : 'Good signal restored. Demo readings are running.');
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
$('#logout').addEventListener('click', () => {
  state.inDemo = false; state.data = []; state.alerts = [];
  $('#app-shell').hidden = true; $('#welcome-screen').hidden = false;
  $('#enter-demo').focus();
});
$('#enter-demo').addEventListener('click', () => {
  const timestamp = Date.now(); state.data = []; state.alerts = []; state.scenario = 'normal'; state.paused = false; state.lastReceived = timestamp; state.inDemo = true;
  for (let i = 0; i <= 3600; i++) state.data.push(makeReading(timestamp - (3600 - i) * 1000, i));
  state.sequence = 3600; $('#app-shell').hidden = false; $('#welcome-screen').hidden = true;
  $('#recent-alert-content').innerHTML = '<span class="check-circle"><svg class="icon"><use href="#i-check"/></svg></span><strong>No new alerts</strong><p>New alerts from your care team<br>will appear here.</p>';
  location.hash = 'dashboard'; renderAlerts(); navigate(); $('#main-content').focus();
});
$('#current-date').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
setInterval(() => { if (!state.inDemo) return; if (!state.paused && state.scenario !== 'offline') addReading(); renderReadings(); }, 1000);
navigate(); renderAlerts();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => { /* Browsing still works when installation is unavailable. */ });
