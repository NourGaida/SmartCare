const roles = new Map([
  ['PATIENT', 'patient'],
  ['PROFESSIONAL', 'professional'],
  ['ADMIN', 'administrator'],
  ['ADMINISTRATOR', 'administrator']
]);

export function createServerAuth(baseUrl, request = globalThis.fetch) {
  async function call(path, { method = 'GET', body, csrf } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = csrf;
    try {
      return await request(new URL(path, baseUrl), {
        method, headers, credentials: 'same-origin', cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new Error('Could not reach the SmartCare server. Check your connection and try again.');
    }
  }

  function check(response) {
    if (response.ok) return;
    if (response.status === 429) throw new Error('Too many sign-in attempts. Please wait and try again.');
    throw new Error(`The SmartCare server returned HTTP ${response.status}. Please try again.`);
  }

  async function readSession() {
    const response = await call('session');
    if (response.status === 401) return null;
    check(response);
    const data = await response.json().catch(() => null);
    const role = typeof data?.role === 'string' ? roles.get(data.role.toUpperCase()) : undefined;
    if (!role || typeof data.userId !== 'string' || !data.userId ||
        typeof data.csrfToken !== 'string' || !data.csrfToken) {
      throw new Error('The SmartCare server returned an invalid session.');
    }
    return { userId: data.userId, role, csrfToken: data.csrfToken };
  }

  async function signOut(session) {
    const response = await call('auth/logout', { method: 'POST', csrf: session.csrfToken });
    if (response.status !== 401) check(response);
  }

  return {
    readSession,
    async signIn({ email, password }, allowedRoles) {
      const response = await call('auth/login', { method: 'POST', body: { email: email.trim(), password } });
      if (response.status === 401) throw new Error('Email address or password is incorrect.');
      check(response);
      const session = await readSession();
      if (!session) {
        throw new Error('The server accepted the login, but the browser did not establish a session. Open the portal from the SmartCare server address and try again.');
      }
      if (!allowedRoles.includes(session.role)) {
        await signOut(session);
        throw new Error('This account belongs in the other SmartCare portal.');
      }
      return session;
    },
    signOut
  };
}
