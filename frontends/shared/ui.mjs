import { chartSegments, readingsCSV } from './domain.mjs';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const formatTime = timestamp => Number.isFinite(timestamp)
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }).format(timestamp) : 'Not available';
export const chip = (text, warning = false) =>
  '<span class="status-chip' + (warning ? ' warning' : '') + '">' + escapeHTML(text) + '</span>';

export function downloadCSV(rows, filename) {
  if (!rows.length) throw new Error('No readings to export for this selection.');
  const url = URL.createObjectURL(new Blob([readingsCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function chartMarkup(rows, metric, end = Date.now(), minutes = 15) {
  const start = end - minutes * 60000;
  const min = metric === 'hr' ? 40 : 85;
  const max = metric === 'hr' ? 190 : 100;
  const x = value => 45 + (value - start) / (end - start) * 610;
  const y = value => 210 - (value - min) / (max - min) * 180;
  const segments = chartSegments(rows, metric);
  const paths = segments.map(part => {
    if (part.length === 1) {
      const [reading] = part;
      return '<circle fill="#008c95" r="4" cx="' + x(reading.timestamp).toFixed(2) +
        '" cy="' + y(reading[metric]).toFixed(2) + '"/>';
    }
    return '<polyline fill="none" stroke="#008c95" stroke-width="2.5" points="' +
      part.map(row => x(row.timestamp).toFixed(2) + ',' + y(row[metric]).toFixed(2)).join(' ') + '"/>';
  }).join('');
  const grid = [min, (max + min) / 2, max].map(value =>
    '<line x1="45" x2="655" y1="' + y(value) + '" y2="' + y(value) +
    '" stroke="#e5edf2"/><text x="5" y="' + (y(value) + 4) + '">' + value + '</text>').join('');
  const clock = new Intl.DateTimeFormat('en-GB', end - start <= 120000
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
  const ticks = [
    { value: start, x: 45, align: 'start' },
    { value: (start + end) / 2, x: 350, align: 'middle' },
    { value: end, x: 655, align: 'end' }
  ].map(tick => '<text class="chart-time" x="' + tick.x + '" y="240" text-anchor="' +
    tick.align + '">' + clock.format(tick.value) + '</text>').join('');
  return '<svg class="clinical-chart" viewBox="0 0 700 250" data-range-start="' + Math.round(start) +
    '" data-range-end="' + Math.round(end) + '" role="img" aria-label="' +
    (metric === 'hr' ? 'Heart rate in bpm' : 'Blood oxygen in percent') +
    '. Missing and invalid readings appear as gaps."><g fill="#496579" font-size="16">' +
    grid + ticks + '</g>' + paths + '</svg>' +
    (!rows.length ? '<p class="section-note">No readings in this interval.</p>' : '');
}
