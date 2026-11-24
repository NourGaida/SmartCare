import { chartMarkup, escapeHTML as h, formatTime as time } from './ui.mjs';

export function panelMarkup(title, description, content) {
  return '<article class="panel"><div class="panel-header"><div><h2>' + h(title) + '</h2><p>' +
    h(description) + '</p></div></div>' + content + '</article>';
}

export function careState(message, { retry = false, retryLabel = 'Retry' } = {}) {
  return '<div class="history-feedback"><p role="status">' + h(message) + '</p>' +
    (retry ? '<button class="button button-outline" type="button" data-care-retry>' + h(retryLabel) + '</button>' : '') + '</div>';
}

function readingsWindow(rows) {
  const end = rows.at(-1).timestamp + 1000;
  const start = rows[0].timestamp - 1000;
  return [end, Math.max(1000, end - start) / 60000];
}

export function measurementCharts(rows) {
  if (!rows.length) return careState('No measurements are available yet.');
  const [end, range] = readingsWindow(rows);
  return '<div class="history-graphs"><section><h3>Heart rate · bpm</h3>' +
    chartMarkup(rows, 'hr', end, range) + '</section><section><h3>Blood oxygen · %</h3>' +
    chartMarkup(rows, 'spo2', end, range) + '</section></div>';
}

const alertTitles = {
  HIGH_HEART_RATE: 'Sustained high heart rate', LOW_HEART_RATE: 'Sustained low heart rate',
  LOW_SPO2: 'Sustained low blood oxygen'
};

export function connectedAlerts(alerts, { acknowledge = false, patient = false } = {}) {
  const content = alerts.length ? '<div class="alert-list">' + alerts.map(alert => {
    const status = alert.status === 'resolved' ? 'Resolved' : 'Open';
    const acknowledgement = alert.acknowledgedAt
      ? 'Acknowledged · ' + time(Date.parse(alert.acknowledgedAt)) : 'Awaiting acknowledgement';
    const onset = alert.startedAt || alert.confirmedAt;
    const when = patient ? (alert.startedAt ? 'Début ' : 'Confirmation ') : (alert.startedAt ? 'Started ' : 'Confirmed ');
    const title = patient ? 'Mesures inhabituelles à vérifier' : alertTitles[alert.anomalyType] || 'Sustained signal anomaly';
    return '<div class="care-alert" data-alert-id="' + h(alert.id) + '"><h3>' + h(title) +
      '</h3><p>' + h(when) + '<time datetime="' + h(onset) + '">' + h(time(Date.parse(onset))) + '</time></p>' +
      (patient ? '' : '<p>' + h(alert.deviceId) + ' · ' + h(status + ' · ' + acknowledgement) + '</p>') +
      (!patient && acknowledge && alert.note ? '<p>Note: ' + h(alert.note) + '</p>' : '') +
      (!patient && acknowledge && !alert.acknowledgedAt ? '<form class="form-grid care-ack" data-ack-alert="' +
        h(alert.id) + '"><label>Acknowledgement note<input name="note" required maxlength="500"></label>' +
        '<button class="button button-outline">Acknowledge</button></form>' : '') + '</div>';
  }).join('') + '</div>' : careState(patient ? 'Aucune alerte enregistrée.' : 'No rule alerts have been recorded.');
  return panelMarkup(patient ? 'Vos alertes' : 'Rule alerts', patient ? '' : 'Confirmed by the server detector.', content);
}
