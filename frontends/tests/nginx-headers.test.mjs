import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../../docker/nginx-https.conf', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../../docker/compose.https.yml', import.meta.url), 'utf8');
const security = readFileSync(new URL('../../docker/nginx-security-headers.conf', import.meta.url), 'utf8');
const mime = readFileSync(new URL('../../docker/nginx-mime-types.conf', import.meta.url), 'utf8');
const count = (text, needle) => text.split(needle).length - 1;

test('every Cache-Control location keeps the inherited security headers', () => {
  const blocks = config.split(/(?=^    location )/m);
  let checked = 0;
  for (const block of blocks) {
    if (!/^    location /.test(block) || !/add_header Cache-Control/.test(block)) continue;
    assert.match(block, /include \/etc\/nginx\/snippets\/smartcare-security-headers\.conf;/, block.split('\n')[0]);
    checked += 1;
  }
  assert.ok(checked >= 12, `expected Cache-Control locations, found ${checked}`);
});

test('nginx sends no-store for 404 and 5xx and keeps no-cache for sw.js', () => {
  assert.equal(count(config, 'error_page 404 500 502 503 504 @smartcare_error;'), 2);
  assert.equal(count(config, 'location @smartcare_error {'), 2);
  assert.equal(count(config, 'add_header Cache-Control "no-store" always;'), 2);
  assert.ok(count(config, 'add_header Cache-Control "no-cache" always;') >= 6);
  assert.equal(count(config, 'add_header Cache-Control "public, max-age=31536000, immutable" always;'), 2);
  assert.equal(count(config, 'add_header Cache-Control "public, max-age=3600" always;'), 2);
});

test('global MIME table is complete and no location overrides types', () => {
  for (const mapping of [
    /text\/html\s+html htm shtml;/,
    /text\/css\s+css;/,
    /application\/javascript\s+js;/,
    /text\/javascript\s+mjs;/,
    /image\/svg\+xml\s+svg svgz;/,
    /image\/png\s+png;/,
    /image\/x-icon\s+ico;/,
    /font\/woff2\s+woff2;/,
    /application\/json\s+json;/,
    /application\/manifest\+json\s+webmanifest;/
  ]) {
    assert.match(mime, mapping);
  }
  assert.doesNotMatch(config, /types\s*\{/);
  assert.doesNotMatch(config, /default_type/);
  assert.doesNotMatch(config, /smartcare-mime-types\.conf/);
});

test('compose mounts the global MIME table and the security snippet uses always', () => {
  assert.match(compose, /nginx-security-headers\.conf:\/etc\/nginx\/snippets\/smartcare-security-headers\.conf:ro/);
  assert.match(compose, /nginx-mime-types\.conf:\/etc\/nginx\/mime\.types:ro/);
  for (const header of ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Content-Type-Options']) {
    assert.match(security, new RegExp(`add_header ${header} .* always;`));
  }
});
