# ADR-0011 — Local hostname routing bypass

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [B6 verification](../https-pwa/07-https-verification.md)
- Supersedes: none

## Context
- The frontends were reported as partly loaded, unstyled and showing **Demonstration mode** while `curl.exe --ssl-no-revoke` returned `200` with the correct HTML and MIME type.
- The user confirmed that disabling a built-in browser VPN fixed both hosts. The likely mechanism is a browser VPN, secure DNS, proxy or data-saver feature resolving `*.smartcare.local` remotely and bypassing the Windows hosts file.
- Two earlier rendering failures were real server bugs and were fixed separately: asset routing (`c34fb93`) and a partial MIME table (`ec7cfe9`, ADR-0010). Neither is the cause of this incident.

## Decision
- Treat this symptom as a local DNS/proxy routing issue, not an nginx, TLS, service-worker or application bug.
- Verify with DevTools Network → **Remote Address**; it must be `192.168.1.4:443`.
- Turn off browser VPN/proxy/secure DNS, then use the browser-specific clearing steps in [clear-browser-state.md](../https-pwa/clear-browser-state.md).
- Do not change nginx or service-worker code for this incident.
- Carry the same warning into Phase D phone-access documentation: phone VPN, Private DNS, ad blockers and data saver can bypass LAN DNS or a local CA.

## Alternatives considered
- Add more nginx redirects or `try_files` rules: rejected because curl already proved the server response was correct.
- Clear browser storage before checking Remote Address: rejected because it hides the actual DNS cause and wastes time.
- Change the hostname scheme: rejected; the scheme is already decided in ADR-0001 and Phase D is documentation-only.

## Consequences
- Positive: the incident is triaged by evidence instead of by visual symptoms.
- Positive: no speculative production config changes.
- Negative: browser-specific VPN/secure-DNS settings must remain part of the troubleshooting checklist.
- Negative: phone access remains DEFERRED until Phase D documents DNS and CA setup.

## References
- [Browser state clearing guide](../https-pwa/clear-browser-state.md)
- [ADR-0001 local hostnames](ADR-0001-local-hostnames.md)
- [ADR-0010 global MIME table](ADR-0010-global-mime-table.md)
