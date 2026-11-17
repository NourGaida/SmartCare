import { createMeasurementsAdapter } from './measurements-adapter.mjs';
import { mountHistory } from './history.mjs';
import { mountConnectivity } from '../shared/connectivity.mjs';

// The shared portal owns login/logout and the cookie session. This mount only owns the patient view.
export function mountServerHistory({ session, apiBaseUrl, onSignOut, onSessionExpired }) {
  if (session.role !== 'patient') throw new Error('Patient history requires a patient session.');
  const $ = selector => document.querySelector(selector);
  const shell = $('#app-shell');
  const view = $('#view-history');
  const controller = mountHistory(view, {
    adapter: createMeasurementsAdapter({ apiBaseUrl }), onSessionExpired
  });
  const stopConnectivity = mountConnectivity($('#connectivity-notice'));
  $('#welcome-screen').hidden = true; shell.hidden = false; view.hidden = false;
  document.querySelector('.skip-link').href = '#main-content';
  for (const item of shell.querySelectorAll('.view')) item.hidden = item !== view;
  for (const link of shell.querySelectorAll('[data-route]')) {
    link.hidden = link.dataset.route !== 'history';
    link.classList.toggle('active', link.dataset.route === 'history');
    if (link.dataset.route === 'history') link.setAttribute('aria-current', 'page');
  }
  shell.querySelector('.brand').href = '#history';
  shell.querySelector('.heading-tools').hidden = true;
  $('#alerts-shortcut').hidden = true;
  $('#page-eyebrow').textContent = 'YOUR MEASUREMENTS';
  $('#page-title').textContent = 'Reading history';
  $('#page-description').textContent = 'Your measurements, in chronological order.';
  $('#breadcrumb-current').textContent = 'History';
  shell.querySelector('.demo-label').textContent = 'SERVER MODE';
  shell.querySelector('.sidebar-note').textContent = 'Server workspace · Current patient session';
  shell.querySelector('.profile strong').textContent = session.userId;
  shell.querySelector('.profile small').textContent = 'Patient · Server account';
  for (const avatar of shell.querySelectorAll('.avatar')) {
    avatar.textContent = session.userId.slice(0, 2).toUpperCase();
    avatar.setAttribute('aria-label', session.userId);
  }
  const buttons = [$('#logout'), $('#mobile-logout')];
  for (const button of buttons) button.lastChild.textContent = 'Sign out';
  async function signOut() {
    buttons.forEach(button => { button.disabled = true; });
    try { await onSignOut(); }
    catch (error) { $('#status-notice').textContent = error.message; $('#status-notice').hidden = false; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  }
  buttons.forEach(button => button.addEventListener('click', signOut));
  const navigate = () => { window.history.replaceState(null, '', '#history'); };
  window.addEventListener('hashchange', navigate); navigate();
  $('#status-notice').hidden = true;
  $('#main-content').focus();
  controller.load();
  return {
    dispose() {
      controller.dispose(); stopConnectivity();
      buttons.forEach(button => button.removeEventListener('click', signOut));
      window.removeEventListener('hashchange', navigate);
      shell.hidden = true;
      shell.querySelector('.profile strong').textContent = '';
      shell.querySelector('.profile small').textContent = '';
      shell.querySelectorAll('.avatar').forEach(avatar => { avatar.textContent = ''; avatar.removeAttribute('aria-label'); });
      $('#status-notice').textContent = ''; $('#status-notice').hidden = true;
    }
  };
}
