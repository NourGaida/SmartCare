import { createServerAuth } from './server-auth.mjs';

export function mountServerPortal(portal, {
  auth,
  loadPatientHistory = () => import('../frontoffice/server-history.mjs'),
  loadStaffCare = () => import('../backoffice/server-care.mjs')
} = {}) {
  const isPatientPortal = portal === 'frontoffice';
  const allowedRoles = isPatientPortal ? ['patient'] : ['professional', 'administrator'];
  const apiBaseUrl = new URL('../../api/', import.meta.url);
  auth = auth || createServerAuth(apiBaseUrl);
  const card = document.querySelector('.welcome-card');
  const form = document.querySelector('#login-form');
  const submit = document.querySelector('#login-submit');
  const message = form.querySelector('[role="status"]');
  const intro = card.querySelector('p');
  const password = form.elements.namedItem('password');
  const signup = isPatientPortal ? card.querySelector('#signup-form') : null;
  const signupLink = isPatientPortal ? card.querySelector('#show-signup') : null;
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
  const demoAccess = card.querySelector('.demo-access');
  if (demoAccess) demoAccess.hidden = true;
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
  let workspace = null;
  function showSignup(open) {
    if (!signup || !signupLink) return;
    form.hidden = open;
    signup.hidden = !open;
    signupLink.hidden = open;
    if (!open) {
      signup.reset();
      signup.querySelector('[role="status"]').textContent = '';
    }
  }

  function showLogin(note) {
    currentSession = null;
    workspace?.dispose(); workspace = null;
    heading.textContent = ''; details.textContent = '';
    showSignup(false);
    sessionPanel.hidden = true; intro.hidden = false; form.hidden = false;
    card.closest('.welcome-screen').hidden = false;
    form.reset(); message.textContent = note;
    document.querySelector('.skip-link').href = '#server-portal';
    window.history.replaceState(null, '', '#login');
    form.elements.namedItem('email').focus();
  }
  async function signOut() {
    await auth.signOut(currentSession);
    showLogin('Signed out.');
  }
  async function showSession(session) {
    currentSession = session;
    if (isPatientPortal || session.role === 'professional') {
      const mount = isPatientPortal ? (await loadPatientHistory()).mountServerHistory
        : (await loadStaffCare()).mountServerCare;
      if (currentSession !== session) return;
      workspace?.dispose();
      form.reset(); message.textContent = '';
      workspace = mount({
        session, apiBaseUrl, onSignOut: signOut, onSessionExpired: showLogin
      });
      return;
    }
    heading.textContent = 'Signed in as ' + (session.displayName || session.userId);
    details.textContent = 'Administrator account. Clinical records are available to patients and assigned professionals.';
    form.reset();
    message.textContent = '';
    intro.hidden = true;
    form.hidden = true;
    if (signupLink) signupLink.hidden = true;
    sessionPanel.hidden = false;
    heading.focus();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    message.textContent = 'Signing in…';
    try {
      await showSession(await auth.signIn(Object.fromEntries(new FormData(form)), allowedRoles));
    } catch (error) {
      message.textContent = error.message;
    } finally {
      password.value = '';
      submit.disabled = false;
    }
  });

  if (signup && signupLink) {
    const signupMessage = signup.querySelector('[role="status"]');
    const signupSubmit = signup.querySelector('[type="submit"]');
    const back = signup.querySelector('[data-back-to-login]');
    signupLink.addEventListener('click', () => {
      showSignup(true);
      signup.elements.namedItem('name').focus();
    });
    back.addEventListener('click', () => {
      showSignup(false);
      form.elements.namedItem('email').focus();
    });
    signup.addEventListener('submit', async event => {
      event.preventDefault();
      if (signupSubmit.disabled) return;
      const fields = Object.fromEntries(new FormData(signup));
      if (fields.password !== fields.confirmPassword) {
        signupMessage.textContent = 'The passwords do not match.';
        return;
      }
      signupSubmit.disabled = true;
      back.disabled = true;
      signupMessage.textContent = 'Creating your account…';
      try {
        await auth.signUp(fields);
        showLogin('Account created. Sign in with your new patient account.');
        form.elements.namedItem('email').value = fields.email.trim();
        password.focus();
      } catch (error) {
        signupMessage.textContent = error.message;
        signup.elements.namedItem('password').value = '';
        signup.elements.namedItem('confirmPassword').value = '';
      } finally {
        signupSubmit.disabled = false;
        back.disabled = false;
      }
    });
  }

  logout.addEventListener('click', async () => {
    logout.disabled = true;
    sessionMessage.textContent = '';
    try {
      await signOut();
    } catch (error) {
      sessionMessage.textContent = error.message;
    } finally {
      logout.disabled = false;
    }
  });

  submit.disabled = true;
  if (signupLink) signupLink.disabled = true;
  const ready = auth.readSession().then(session => {
    if (!session) return;
    if (allowedRoles.includes(session.role)) return showSession(session);
    else message.textContent = 'Your session is active in the other SmartCare portal.';
  }).catch(error => { message.textContent = error.message; })
    .finally(() => {
      submit.disabled = false;
      if (signupLink) signupLink.disabled = false;
    });
  return { ready };
}
