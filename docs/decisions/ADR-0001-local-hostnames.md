# ADR-0001 — Local hostnames via Windows hosts file

- Status: Accepted (user decision D1/D2 context, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B1](../https-pwa/02-hostnames.md)
- Supersedes: none

## Context
- The lab PC has no DNS records for `app.smartcare.local` or `staff.smartcare.local`.
- PWA installability needs stable HTTPS origins; IP addresses with ports are not acceptable production-style origins.
- The AI agent must not trigger UAC or modify router/phone settings.
- Phones are out of scope until Phase D.

## Decision
- Add an idempotent, admin-only PowerShell script `scripts/setup-hosts.ps1` that manages three names in the Windows hosts file: `app.smartcare.local`, `staff.smartcare.local`, `api.smartcare.local` → default `192.168.1.4`.
- The script is run manually by the user in an elevated PowerShell; output is pasted into evidence.
- The certificate in B2 will cover `*.smartcare.local`, so these names are stable.
- Documentation will describe dnsmasq/cloudflared for phones but will not implement them in Phase B.

## Alternatives considered
- **dnsmasq on the LAN**: solves phones too, but needs router admin or phone Wi-Fi changes; deferred to Phase D.
- **cloudflared tunnel**: works outside the LAN, but exposes demo data publicly and needs origin header flags; documentation only per D12.
- **Wildcard public DNS names** (`nip.io`): no local edit, but public-looking history and no offline identity story.
- **Changing WildFly context root**: rejected in D1; nginx rewrites `/api/` instead.

## Consequences
- Positive: no new services, no new Docker network, no elevation by the agent, easy `-Remove` rollback.
- Negative: only the PC resolves the names in Phase B; phone verification remains `UNVERIFIED` until Phase D.
- Negative: VPN or corporate DNS can shadow the hosts file; troubleshooting is documented.
- The hosts-file backup is created outside the repository and must never be committed.

## References
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/hosts-file
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig
