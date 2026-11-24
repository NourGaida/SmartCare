import { careState, panelMarkup } from '../shared/connected-views.mjs';
import { escapeHTML as h } from '../shared/ui.mjs';
export { scenarioResult as simulationResult } from '../shared/scenario-view.mjs';

export function simulationControls(patients, { selectedDevice = '', running = false } = {}) {
  const devices = patients.flatMap(patient => patient.devices
    .filter(device => device.simulationEnabled)
    .map(device => ({ id: device.deviceId, patient: patient.id, name: patient.name })));
  const disabled = running ? ' disabled' : '';
  const hardware = '<figure class="sensor-illustration">' +
    '<div class="sensor-boards" aria-hidden="true"><div class="esp-board"><i></i><b></b><em></em></div>' +
    '<div class="sensor-wire"></div><div class="oximeter-board"><i></i><b></b></div></div>' +
    '<figcaption>ESP32 board · MAX30102 optical sensor</figcaption></figure>';
  const controls = devices.length ? '<div class="sensor-controls">' +
    '<label>Patient and device<select id="simulation-device"' + disabled + '>' +
    devices.map(device => '<option value="' + h(device.id) + '" data-patient="' + h(device.patient) + '"' +
      (selectedDevice === device.id ? ' selected' : '') + '>' + h(device.name + ' · ' + device.id) + '</option>').join('') +
    '</select></label><div class="scenario-buttons">' +
    ['normal', 'spike', 'sustained', 'invalid'].map(scenario => '<button class="button button-outline" type="button" data-scenario="' +
      scenario + '"' + disabled + '>' + scenario + '</button>').join('') + '</div></div>'
    : careState('No assigned device is enabled for simulation.');
  return '<div class="stack">' + panelMarkup('Simulation des capteurs',
    'Generated test readings are sent through MQTT and shown as they reach MongoDB.', hardware + controls) +
    '<div id="simulation-output" role="region" aria-label="Simulation readings">' +
    careState('Choose an assigned device and start a scenario.') +
    '</div><div id="simulation-alerts" aria-live="polite"></div></div>';
}
