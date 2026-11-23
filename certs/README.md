# Local certificate storage — DO NOT COMMIT CERTIFICATE MATERIAL

Everything in this directory is ignored by git except this README and `.gitkeep`.

| File | Purpose | Commit? |
| --- | --- | --- |
| `ca/rootCA.pem` | mkcert local CA certificate | No |
| `ca/rootCA-key.pem` | mkcert local CA private key | **Never** |
| `smartcare.local.pem` | leaf certificate for `*.smartcare.local` | No |
| `smartcare.local-key.pem` | leaf private key used by nginx | **Never** |

Run B2 from the repository root in an elevated PowerShell:

```powershell
$env:CAROOT = (Resolve-Path .\certs\ca).Path
mkcert -install
PowerShell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gen-certs.ps1
```

`mkcert -install` triggers Windows UAC. Provide the terminal output to the integrator; do not paste private keys or `rootCA-key.pem`. Phones need the CA certificate installed separately in Phase D; copy only `ca/rootCA.pem` to the phone, never the key.

Rollback: `mkcert -uninstall` (with the same `CAROOT`) removes trust, then delete this directory's generated files.
