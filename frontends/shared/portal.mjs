import { createServerAuth } from './server-auth.mjs';

const portal = document.querySelector('script[data-portal]').dataset.portal;
const isPatientPortal = portal === 'frontoffice';

// The WildFly WAR serves both portals and the session API from /smartcare.
// A static server at the repository root continues to serve the demo.
if (location.pathname.startsWith('/smartcare/frontends/')) {
  mountServerPortal();
} else if (isPatientPortal) {
  import('../frontoffice/app.js');
} else {
  import('../backoffice/app.mjs');
}

function mountServerPortal() {
  const allowedRoles = isPatientPortal ? ['patient'] : ['professional', 'administrator'];
  const auth = createServerAuth(new URL('../../api/', import.meta.url));
  const card = document.querySelector('.welcome-card');
  const form = document.querySelector('#login-form');
  const submit = document.querySelector('#login-submit');
  const message = form.querySelector('[role="status"]');
  const intro = card.querySelector('p');
  const password = form.elements.namedItem('password');
  const otherPortal = document.createElement('a');
  otherPortal.href = isPatientPortal ? '../backoffice/' : '../frontoffice/';
  otherPortal.textContent = isPatientPortal ? 'Open supervision' : 'Open patient portal';
  otherPortal.className = 'text-link';
  card.id = 'server-portal';
  card.tabIndex = -1;
  document.querySelector('.skip-link').href = '#server-portal';
  card.querySelector('h1').textContent = isPatientPortal ? 'Patient portal' : 'Supervision portal';
  intro.textContent = 'Sign in with your SmartCare server account.';
  password.labels[0].firstChild.textContent = 'Password';
  submit.textContent = 'Sign in';
  card.querySelector('.demo-access').hidden = true;
  const demoNote = card.querySelector(':scope > small');
  if (demoNote) demoNote.hidden = true;

  const sessionPanel = document.createElement('section');
  sessionPanel.className = 'login-form';
  sessionPanel.hidden = true;
  const heading = document.createElement('h2');
  heading.tabIndex = -1;
  const details = document.createElement('p');
  const sessionMessage = document.createElement('p');
  sessionMessage.className = 'form-message';
  sessionMessage.setAttribute('role', 'status');
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'button button-primary';
  logout.textContent = 'Sign out';
  sessionPanel.append(heading, details, sessionMessage, logout);
  card.append(sessionPanel, otherPortal);

  let currentSession = null;
  function showSession(session) {
    currentSession = session;
    heading.textContent = 'Signed in as ' + session.userId;
    details.textContent = `Role: ${session.role}. Measurements and alerts will appear when their server endpoints are available.`;
    form.reset();
    message.textContent = '';
    intro.hidden = true;
    form.hidden = true;
    sessionPanel.hidden = false;
    heading.focus();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    message.textContent = 'Signing in…';
    try {
      showSession(await auth.signIn(Object.fromEntries(new FormData(form)), allowedRoles));
    } catch (error) {
      message.textContent = error.message;
    } finally {
      password.value = '';
      submit.disabled = false;
    }
  });

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    sessionMessage.textContent = '';
    try {
      await auth.signOut(currentSession);
      currentSession = null;
      heading.textContent = '';
      details.textContent = '';
      sessionPanel.hidden = true;
      intro.hidden = false;
      form.hidden = false;
      message.textContent = 'Signed out.';
      form.elements.namedItem('email').focus();
    } catch (error) {
      sessionMessage.textContent = error.message;
    } finally {
      logout.disabled = false;
    }
  });

  submit.disabled = true;
  auth.readSession().then(session => {
    if (!session) return;
    if (allowedRoles.includes(session.role)) showSession(session);
    else message.textContent = 'Your session is active in the other SmartCare portal.';
  }).catch(error => { message.textContent = error.message; })
    .finally(() => { submit.disabled = false; });
}
