# IAM module

Identity and access management for SmartCare server sessions.

## Current state

The module validates credentials, creates and expires sessions, and generates CSRF tokens. It uses `core` repositories to persist users, sessions, and login-attempt counters. The API module exposes these services to the two portals.

## Build

```powershell
mvn -f middleware/pom.xml -pl iam -am clean verify
```

The parent reactor builds it as part of `mvn -f middleware/pom.xml clean verify`.

## Planned scope

- Role-based authorization for patient, professional and administrator actions.
- Backend-owned ownership and assignment checks.
- Audit logging.

See the [API module](../api/README.md) for local deployment and portal sign-in.
