export class AccessError extends Error {
  constructor(message = 'Access denied. This workspace does not allow this action.') {
    super(message);
    this.code = 'FORBIDDEN';
  }
}

export function requireRole(session, role) {
  if (!session || session.role !== role) throw new AccessError();
}

export function assignedPatientIds(session, assignments) {
  requireRole(session, 'professional');
  return assignments.filter(item => item.professionalId === session.id).map(item => item.patientId);
}

export function requirePatientAccess(session, assignments, patientId) {
  if (!assignedPatientIds(session, assignments).includes(patientId)) {
    throw new AccessError('Access denied. This patient is not assigned to you.');
  }
}

export function acknowledge(alert, session, assignments, note, now = Date.now()) {
  requirePatientAccess(session, assignments, alert.patientId);
  if (alert.state !== 'open') throw new Error('Only an open, unacknowledged alert can be acknowledged.');
  const text = note.trim();
  if (!text || text.length > 500) throw new Error('Add a note between 1 and 500 characters.');
  // Acknowledgement records review; resolution belongs to the backend episode lifecycle.
  return { ...alert, state: 'acknowledged', note: text,
    acknowledgedBy: session.name, acknowledgedById: session.id,
    acknowledgedAt: now };
}

export const isStale = (timestamp, now = Date.now()) =>
  !Number.isFinite(timestamp) || now - timestamp >= 30000;

export function filterReadings(rows, { minutes = 'all', quality = 'all', end = Date.now() } = {}) {
  const start = minutes === 'all' ? 0 : end - Number(minutes) * 60000;
  return rows.filter(row => row.timestamp >= start && row.timestamp <= end &&
    (quality === 'all' || row.quality === quality));
}

export function paginate(rows, page = 1, size = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.max(1, Math.min(page, pages));
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages, total: rows.length };
}

export function chartSegments(rows, metric, maxGap = 1500) {
  const result = [];
  let part = [];
  for (const row of rows) {
    if (row.quality !== 'good' || !Number.isFinite(row[metric])) {
      if (part.length) result.push(part);
      part = [];
      continue;
    }
    if (part.length && row.timestamp - part[part.length - 1].timestamp > maxGap) {
      result.push(part);
      part = [];
    }
    part.push(row);
  }
  if (part.length) result.push(part);
  return result;
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function readingsCSV(rows) {
  return ['timestamp_utc,device_id,heart_rate_bpm,spo2_percent,quality,source',
    ...rows.map(row => [new Date(row.timestamp).toISOString(), row.deviceId,
      row.hr, row.spo2, row.quality, row.source].map(csvCell).join(','))].join('\r\n');
}
