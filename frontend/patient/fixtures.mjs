export function makeReading(timestamp, sequence, valid = true) {
  const wave = Math.sin(sequence / 31) * 4 + Math.sin(sequence / 11) * 2.4 + Math.sin(sequence / 89) * 3.3;
  return { timestamp, hr: valid ? Math.round(78 + wave) : null,
    spo2: valid ? Math.round(97 + .6 * Math.sin(sequence / 71)) : null,
    quality: valid ? 'good' : 'poor', reason: valid ? null : 'no_finger',
    source: 'simulated', sequence, deviceId: 'SC-DEMO-001' };
}

export function initialReadings(now) {
  const readings = [];
  for (let index = 0; index <= 3600; index++) {
    // An absent interval and invalid samples make gaps inspectable from the start.
    if (index >= 3300 && index < 3306) continue;
    readings.push(makeReading(now - (3600 - index) * 1000, index,
      !(index >= 3450 && index < 3460)));
  }
  return readings;
}

export function demoAlert(id, timestamp) {
  return { id, timestamp, title: 'Signal quality needs attention', state: 'open',
    source: 'demo-rule', reason: 'no_finger', ruleVersion: 'demo-quality-v1',
    startedAt: timestamp - 12000, endedAt: null,
    measurements: [makeReading(timestamp, 1, false)] };
}
