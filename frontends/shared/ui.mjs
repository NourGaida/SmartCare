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
  const paths = segments.map(part => '<polyline fill="none" stroke="#008c95" stroke-width="2" points="' +
    part.map(row => x(row.timestamp).toFixed(2) + ',' + y(row[metric]).toFixed(2)).join(' ') + '"/>').join('');
  const grid = [min, (max + min) / 2, max].map(value =>
    '<line x1="45" x2="655" y1="' + y(value) + '" y2="' + y(value) +
    '" stroke="#e5edf2"/><text x="5" y="' + (y(value) + 4) + '">' + value + '</text>').join('');
  const clock = timestamp => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  return '<svg class="clinical-chart" viewBox="0 0 700 250" role="img" aria-label="' +
    (metric === 'hr' ? 'Heart rate in bpm' : 'Blood oxygen in percent') +
    '. Missing and invalid readings appear as gaps."><g fill="#587185" font-size="12">' +
    grid + '<text x="45" y="240">' + clock(start) + '</text><text x="610" y="240">' +
    clock(end) + '</text></g>' + paths + '</svg>' +
    (!rows.length ? '<p class="section-note">No readings in this interval.</p>' : '');
}
