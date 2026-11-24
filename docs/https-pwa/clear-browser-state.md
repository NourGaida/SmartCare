# Clearing browser state and checking local DNS routing

This document is for the local HTTPS hostnames `app.smartcare.local` and `staff.smartcare.local`. It does **not** change nginx, certificates or the service worker.

## Symptom

- The page loads only partly, is unstyled, shows a broken logo or shows **Demonstration mode**.
- `curl.exe --ssl-no-revoke -sS -D - -o NUL https://app.smartcare.local/` still returns `200` with `Content-Type: text/html`.
- HTTPS works and the certificate padlock is shown.

## Confirmed cause

A built-in browser VPN, secure DNS, proxy or data-saving feature can send requests for `*.smartcare.local` to a remote server that does not know those names. That bypasses the Windows hosts file even when the host entry is correct. The user confirmed that turning the VPN off made both frontends render correctly.

This will also affect phones: Private DNS, VPN apps, ad blockers and data-saver modes can bypass local DNS. Phase D must document dnsmasq/tunnel setup and these phone settings; this is not a Phase B bug.

## Check the routing first

1. Open DevTools (`F12`) → **Network** → reload the page.
2. Click the document request (`app.smartcare.local` or `staff.smartcare.local`).
3. Check **Remote Address**. It must be `192.168.1.4:443` for both hosts.
4. If it is another address, turn off the browser VPN/proxy/secure DNS and reload.
5. Try a private window (which usually has no cached worker and often no extensions).

If the Remote Address is correct but the page is still wrong, clear stale browser state below. Do not re-investigate rendering until the address is confirmed.

## Clear stale state

### Chrome

```text
chrome://serviceworker-internals/
```

1. Expand `app.smartcare.local` and `staff.smartcare.local`; click **Unregister** for each.
2. DevTools (`F12`) → **Application** → **Storage** → **Clear site data**. Include cookies and cache.
3. Hard reload with `Ctrl+Shift+R`.
4. Optional isolation check: `Ctrl+Shift+N` for a new Incognito window.

### Microsoft Edge

```text
edge://serviceworker-internals/
```

1. Unregister the workers for both HTTPS hosts.
2. DevTools (`F12`) → **Application** → **Storage** → **Clear site data**.
3. Hard reload with `Ctrl+Shift+R`.
4. Optional isolation check: `Ctrl+Shift+N` for a new InPrivate window.

### Opera

```text
opera://serviceworker-internals/
```

1. Unregister the workers for both HTTPS hosts.
2. DevTools (`F12`) → **Application** → **Storage** → **Clear site data**.
3. Hard reload with `Ctrl+Shift+R`.
4. Optional isolation check: `Ctrl+Shift+N` for a new private window.

## Separate real incidents already fixed

These were genuine server-side bugs and are not the VPN incident:

| Incident | Symptom | Fix |
| --- | --- | --- |
| Asset routing | Real `404` for `icon.svg`, `portal.mjs` and `styles.css`; nginx logs showed missing prefixed files. | `try_files` now uses `/frontoffice$uri` or `/backoffice$uri`; commit `c34fb93`. |
| Partial MIME table | Browser downloaded the page; `Content-Type: application/octet-stream` for `/`. | Removed location-level `types` overrides; mounted the complete global MIME table; commit `ec7cfe9`, ADR-0010. |

## Phase D note

Phone access must verify DNS resolution and CA trust separately. A phone connected to a VPN or using Private DNS may reach a public resolver instead of the LAN DNS server. Document how to disable those features or use the approved tunnel/dnsmasq option before declaring phone access verified.
