# ADR-0013 — Robust WildFly recreation

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [WildFly proxy forwarding](../https-pwa/06-wildfly-proxy.md), [backend live verification](../https-pwa/backend-live-verification.md)
- Supersedes: none

## Context
- The exact original `docker run` flags for `smartcare-wildfly` are not versioned in the repository.
- The HTTPS profile needs `SMARTCARE_SESSION_SECURE=true`, `proxy-address-forwarding=true`, a usable restart policy and the deployed WAR after recreation.
- The existing container had restart policy `no`; relying on a one-off `docker exec` would lose settings on recreation.
- WildFly deployments may live in the container layer rather than a versioned mount, so a naive rebuild could drop the WAR.
- MongoDB data lives in `smartcare-mongodb` and must not be recreated by this script.

## Decision
- Add `scripts/recreate-wildfly.ps1` with `-DryRun`, `-Force`, configurable container/image/restart/deployment volume and timeout.
- Inspect the existing container and preserve its published ports, mounts, networks and environment; override only `SMARTCARE_SESSION_SECURE=true`.
- Build `docker/Dockerfile.wildfly-proxy` before touching the running container.
- If the WildFly deployments directory is not already covered by a mount, export it from the existing container into the named volume `smartcare-wildfly-deployments`; never print the exported content.
- Replace the container, verify the startup log marker, `proxy-address-forwarding=true`, `SMARTCARE_SESSION_SECURE=true`, the target restart policy and the `8080/tcp` health endpoint; roll back to the original configuration on failure.
- Keep live recreation UNVERIFIED until the user runs the script and pastes redacted output.

## Alternatives considered
- Hard-code a `docker run` command in docs: rejected because the exact original flags are not versioned and may contain host-specific paths.
- One-off `docker exec` CLI changes: rejected because they are lost on container recreation.
- Move WildFly into `docker/compose.https.yml`: rejected under D6 for Phase B.
- Recreate MongoDB or copy its data: rejected; MongoDB is a separate container and its data is out of scope.

## Consequences
- Positive: live inspection supplies the real ports, mounts, networks and env without committing secrets or personal paths.
- Positive: dry-run validates command construction, and failed verification triggers rollback.
- Positive: restart policy and health checks are explicit rather than assumed.
- Negative: replacement causes a brief WildFly outage; nginx may return 502 during the swap.
- Negative: if the source container is missing, the script refuses to guess its configuration.
- Negative: live recreation remains UNVERIFIED until user evidence is supplied.

## References
- [ADR-0005 nginx-only Compose](ADR-0005-nginx-only-compose.md)
- [ADR-0007 WildFly startup config](ADR-0007-wildfly-startup-config.md)
- [ADR-0012 HTTPS backend verification](ADR-0012-https-backend-verification.md)
