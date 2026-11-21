# ADR-0007 — WildFly startup configuration for proxy forwarding

- Status: Accepted (user decision D5, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B5](../https-pwa/06-wildfly-proxy.md)
- Supersedes: none

## Context
- nginx sets `X-Forwarded-Proto`, `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Port`.
- WildFly 42 needs Undertow `proxy-address-forwarding=true` on the default HTTP listener to consume them.
- D5 requires an idempotent script (read first, write only when different, then reload) wired into container startup, not a one-off `docker exec`.
- Upstream image documentation says `CLI_LAUNCH_SCRIPT` does not support management operations implying a restart.

## Decision
- Add `scripts/wildfly-proxy.cli` using CLI `if` control:
  - read `proxy-address-forwarding`;
  - write `true` only when it is `false`;
  - `:reload` only when `launch-type == STANDALONE`.
- Add `scripts/wildfly-entrypoint.sh` that starts the inherited base entrypoint + `standalone.sh`, waits for management, runs the CLI file, tolerates the expected disconnect after reload, verifies the final attribute, and fails closed otherwise.
- Add `docker/Dockerfile.wildfly-proxy` derived from `quay.io/wildfly/wildfly:42.0.0.Final-jdk25` with both scripts, explicit `CMD`, and `SMARTCARE_SESSION_SECURE=true`.
- Real container replacement is Phase C; B5 only builds/tests the image on ports 8085/9995.

## Alternatives considered
- **`CLI_LAUNCH_SCRIPT`**: not viable with `:reload`.
- **One-off `docker exec`**: not reproducible, lost on recreation.
- **Build-time `embed-server` edit**: valid for config-only changes; kept as a test path but does not exercise D5's reload requirement.
- **Shared Docker network**: would still need the header setting; deferred per D6.

## Consequences
- Positive: configuration is versioned, automatic on every start, and survives container recreation.
- Positive: second start performs no write and no reload (verified).
- Negative: derived image must be rebuilt if the base image tag changes.
- Negative: first start incurs one reload; entrypoint handles it and fails closed if final state is wrong.

## References
- https://docs.wildfly.org/wildfly-images/#cli_launch_script
- https://docs.redhat.com/en/documentation/red_hat_jboss_enterprise_application_platform/7.4/html/management_cli_guide/creating_executing_requests
- https://docs.docker.com/reference/dockerfile/#entrypoint
