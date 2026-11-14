# Scripts

Operational and demonstration helpers. Run them from the repository root.

## `check-recovery.ps1`

Demonstrates that `/smartcare/api/health/database` fails fast when MongoDB is down and recovers without redeploying the WAR.

Requirements: SmartCare deployed on WildFly, Docker running, and a MongoDB container named `smartcare-mongodb`.

```powershell
.\scripts\check-recovery.ps1
```

Optional environment overrides:

| Variable | Default |
| --- | --- |
| `SMARTCARE_HEALTH_URL` | `http://localhost:8080/smartcare/api/health/database` |
| `SMARTCARE_MONGO_CONTAINER` | `smartcare-mongodb` |
| `SMARTCARE_RECOVERY_WAIT_SECONDS` | script default |

## `demo-duplicate.js`

Inserts the same valid measurement twice, shows the `E11000` error from the `uq_device_boot_sequence` index, then removes only the demo document.

```powershell
mongosh "mongodb://localhost:27017" scripts/demo-duplicate.js
```

The script uses the `smartcare` database and the field types defined by `SchemaInitializer`.
