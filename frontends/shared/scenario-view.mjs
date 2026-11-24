import { careState, measurementCharts, panelMarkup } from './connected-views.mjs';
import { escapeHTML as h, formatTime } from './ui.mjs';

export function scenarioResult(run, { patient = false } = {}) {
  if (!run) return panelMarkup(patient ? 'Dernier scénario' : 'Latest scenario', '',
    careState(patient ? 'Aucun scénario pour votre appareil.' : 'No scenario for this selection.'));
  const { deviceId, scenario, status, rows, expected, message } = run;
  const summary = patient
    ? { completed: 'Terminé', failed: 'Échec', running: 'En cours' }[status]
    : { completed: 'Completed', failed: 'Failed', running: 'Running' }[status];
  const latest = rows.at(-1);
  const metrics = latest ? '<div class="sensor-values"><p><span>Pouls</span><strong>' +
    h(latest.hr ?? '—') + ' bpm</strong></p><p><span>SpO₂</span><strong>' +
    h(latest.spo2 ?? '—') + ' %</strong></p><p><span>Dernière mesure</span><strong>' +
    h(formatTime(latest.timestamp)) + '</strong></p></div>' : '';
  const progress = '<p class="simulation-progress" role="status">' + h(summary) + ' · ' +
    rows.length + ' / ' + h(expected) + (patient ? ' mesures enregistrées' : ' saved readings') + '</p>';
  const hasInvalid = rows.some(row => row.quality === 'invalid');
  const quality = hasInvalid ? '<p class="notice scenario-signal" role="status">Signal du capteur indisponible' +
    (latest.quality === 'invalid' ? '' : ' pendant le scénario. Signal rétabli.') + '</p>' : '';
  return panelMarkup(patient ? 'Dernier scénario' : deviceId + ' · ' + scenario,
    patient ? deviceId + ' · ' + scenario : 'Latest persisted readings',
    progress + (message ? careState(message) : '') + quality + metrics + measurementCharts(rows) + scenarioTable(rows));
}

function scenarioTable(rows) {
  if (!rows.length) return '';
  return '<div class="table-scroll scenario-table" tabindex="0" aria-label="Mesures du scénario">' +
    '<table><thead><tr><th scope="col">Horodatage (UTC)</th><th scope="col">Pouls (bpm)</th>' +
    '<th scope="col">SpO₂ (%)</th><th scope="col">Signal</th></tr></thead><tbody>' +
    rows.map(row => {
      const timestamp = new Date(row.timestamp).toISOString();
      return '<tr><td><time datetime="' + timestamp + '">' + timestamp + '</time></td><td>' +
        h(row.hr ?? '—') + '</td><td>' + h(row.spo2 ?? '—') + '</td><td>' +
        (row.quality === 'invalid' ? 'Indisponible' : 'Valide') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
