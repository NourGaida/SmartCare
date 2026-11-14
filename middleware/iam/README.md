# IAM module

Identity and access management scaffolding for the planned authentication, role and authorization work.

## Current state

The module contains only its POM and `META-INF/beans.xml`. It has no resources, entities or public API yet. It depends on `core` so that future identity repositories can reuse the persistence layer without creating a reverse dependency.

## Build

```powershell
mvn -f middleware/pom.xml -pl iam -am clean verify
```

The parent reactor builds it as part of `mvn -f middleware/pom.xml clean verify`.

## Planned scope

- Authenticated sessions for the two PWAs.
- Role-based authorization for patient, professional and administrator actions.
- Backend-owned ownership and assignment checks.
- Audit logging.

The current frontend login is a non-secure demo; see the security section of the [repository README](../../README.md).
