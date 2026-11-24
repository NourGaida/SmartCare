import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isServerMode, showServerRequired } from '../shared/server-mode.mjs';

test('legacy paths stay in server mode on any hostname', () => {
  assert.equal(isServerMode({ pathname: '/smartcare/frontends/frontoffice/', hostname: '192.168.1.4' }), true);
  assert.equal(isServerMode({ pathname: '/smartcare/frontends/backoffice/', hostname: 'demo.test' }), true);
});

test('root-hosted apps on smartcare.local hosts are in server mode', () => {
  for (const hostname of ['app.smartcare.local', 'staff.smartcare.local', 'smartcare.local']) {
    assert.equal(isServerMode({ pathname: '/', hostname }), true, hostname);
    assert.equal(isServerMode({ pathname: '/index.html', hostname }), true, hostname);
  }
});

test('other root-hosted origins are not silently switched to server mode', () => {
  assert.equal(isServerMode({ pathname: '/', hostname: 'demo.test' }), false);
  assert.equal(isServerMode({ pathname: '/frontends/frontoffice/', hostname: 'localhost' }), false);
  assert.equal(isServerMode({ pathname: '/', hostname: 'not-smartcare.local.example' }), false);
});

test('both portal entries call the single shared helper', () => {
  for (const relative of ['shared/portal.mjs', 'frontoffice/portal.mjs']) {
    const source = readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
    assert.match(source, /import\s*\{[^}]*isServerMode[^}]*\}\s*from/, relative);
    assert.match(source, /if\s*\(isServerMode\(\)\)/, relative);
    assert.match(source, /else\s*\{\s*showServerRequired\(\)/, relative);
    assert.match(source, /serviceWorker\.register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/, relative);
    assert.doesNotMatch(source, /location\.pathname\.startsWith\('/, relative);
  }
});

test('static previews without a server show where to sign in', () => {
  for (const signup of [{ hidden: false }, null]) {
    const intro = { textContent: '' };
    const form = { hidden: false };
    const nodes = { '.welcome-card > p': intro, '#login-form': form, '#show-signup': signup };
    showServerRequired({ querySelector: selector => nodes[selector] });
    assert.match(intro.textContent, /from your SmartCare server to sign in/);
    assert.equal(form.hidden, true);
    if (signup) assert.equal(signup.hidden, true);
  }
});
