export function isServerMode(location = globalThis.location) {
  const path = location.pathname || '';
  const host = location.hostname || '';
  return path.startsWith('/smartcare/frontends/') || /(^|\.)smartcare\.local$/.test(host);
}

export function showServerRequired(document = globalThis.document) {
  document.querySelector('.welcome-card > p').textContent = 'Open this portal from your SmartCare server to sign in.';
  document.querySelector('#login-form').hidden = true;
  const signup = document.querySelector('#show-signup');
  if (signup) signup.hidden = true;
}
