# Scripts

Operational and demonstration helpers. Run them from the repository root.

Most scripts accept `-DryRun` to validate parameters and print the planned command without changing hosts, certificates, MongoDB, MQTT or Docker state. Use it when a script needs elevated privileges or live infrastructure.

## `gen-certs.ps1`

Generates the gitignored leaf certificate with mkcert after the project CA has been installed.

```powershell
.\scripts\gen-certs.ps1 -DryRun
.\scripts\gen-certs.ps1
```

`-Force` replaces existing leaf files. `-DryRun` performs path, ignore-rule and condition checks but never calls mkcert or `icacls`.

## `setup-hosts.ps1`

Adds the three managed `.smartcare.local` host entries. Requires elevation for real runs; `-DryRun` only prints the managed block.

```powershell
.\scripts\setup-hosts.ps1 -IpAddress 192.168.1.4 -DryRun
```

## `smoke-https.ps1`

Runs GET checks for every asset referenced by both portal `index.html` files, plus manifests, icons, fonts, `sw.js` and `server-mode.mjs`, against `app.smartcare.local` and `staff.smartcare.local`. It asserts status, MIME type, cache directives and security headers, and exits non-zero on any failure.

```powershell
.\scripts\smoke-https.ps1
```

Use `-Repo <REPO>` when running from another directory. The script uses `curl.exe --ssl-no-revoke` and never disables certificate validation.

## `check-recovery.ps1`

Demonstrates that `/smartcare/api/health/database` fails fast when MongoDB is down and recovers without redeploying the WAR.

Requirements: SmartCare deployed on WildFly, Docker running, and a MongoDB container named `smartcare-mongodb`.

```powershell
.\scripts\check-recovery.ps1 -DryRun
.\scripts\check-recovery.ps1
```

Optional environment overrides:

| Variable | Default |
| --- | --- |
| `SMARTCARE_HEALTH_URL` | `http://localhost:8080/smartcare/api/health/database` |
| `SMARTCARE_MONGO_CONTAINER` | `smartcare-mongodb` |
| `SMARTCARE_RECOVERY_WAIT_SECONDS` | script default |

## `publish-test-message.ps1`

Publishes one message directly to the validated topic, bypassing Node-RED, so the backend receiver can be verified without the gateway.

Requirements: the `smartcare-mosquitto` container is running and the backend is deployed.

```powershell
.\scripts\publish-test-message.ps1 -DeviceId sc-test -Sequence 1
```

The script prints the published topic. Use the same `-BootId` and `-Sequence` twice to exercise deduplication. Invalid-quality messages require `-Quality invalid -Reason no_finger`. `-DryRun` prints the payload without publishing.

## `seed-dev-users.ps1`

DEV ONLY. Reads passwords from `DEV_PATIENT_PASSWORD`, `DEV_PROFESSIONAL_PASSWORD` and `DEV_ADMIN_PASSWORD`, then upserts PBKDF2 hashes into MongoDB. `-DryRun` validates the environment and prints the three emails without writing to MongoDB.

```powershell
.\scripts\seed-dev-users.ps1 -DryRun
```

## `demo-duplicate.js`

Inserts the same valid measurement twice, shows the `E11000` error from the `uq_device_boot_sequence` index, then removes only the demo document.

```powershell
mongosh "mongodb://localhost:27017" scripts/demo-duplicate.js
```

The script uses the `smartcare` database and the field types defined by `SchemaInitializer`.
