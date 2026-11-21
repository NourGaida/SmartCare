# ADR-0002 — Local mkcert CA for HTTPS

- Status: Accepted (user decision D9/D11, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B2](../https-pwa/03-local-certificates.md)
- Supersedes: none

## Context
- SmartCare lab names are `*.smartcare.local`; public CAs cannot issue them.
- PWA installation requires a trusted HTTPS origin on the PC and later on phones.
- The repository is public, so certificate material must never be committed.
- The agent cannot trigger UAC.

## Decision
- Use `mkcert` 1.4.4 with a project-local `CAROOT` at `certs/ca/`.
- The user runs `mkcert -install` manually in an elevated PowerShell; the agent only writes scripts and instructions.
- `scripts/gen-certs.ps1` issues one wildcard leaf certificate (`smartcare.local`, `*.smartcare.local`, `localhost`, `127.0.0.1`, `::1`) into git-ignored `certs/`.
- `.gitignore` blocks every PEM/key/PFX file and `rootCA*`; only `certs/README.md` and `certs/.gitkeep` are committed.
- The leaf SHA256 file hash is pasted into evidence; keys are never pasted.

## Alternatives considered
- **OpenSSL self-signed leaf**: no trust store integration; every browser needs an exception; bad PWA demo.
- **Default mkcert CAROOT**: harder to remove and easy to leak into other projects; rejected.
- **Public DNS + Let's Encrypt**: needs a real domain and public DNS; out of scope for a LAN lab.
- **Trusting a corporate CA**: not available and would affect unrelated names.

## Consequences
- Positive: no browser warnings on the PC, one cert for both hostnames, clean rollback with `mkcert -uninstall`.
- Negative: UAC is manual; phone CA install remains Phase D.
- Negative: anyone with the CA key could sign other local names; therefore the key is never copied or committed.

## References
- https://github.com/FiloSottile/mkcert
- https://learn.microsoft.com/en-us/windows/security/application-security/application-control/user-account-control/how-user-account-control-works
