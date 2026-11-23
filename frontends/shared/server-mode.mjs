export function isServerMode(location = globalThis.location) {
  const path = location.pathname || '';
  const host = location.hostname || '';
  return path.startsWith('/smartcare/frontends/') || /(^|\.)smartcare\.local$/.test(host);
}
