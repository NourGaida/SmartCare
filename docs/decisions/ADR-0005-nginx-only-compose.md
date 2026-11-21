# ADR-0005 — nginx-only HTTPS Compose file

- Status: Accepted (user decision D3/D6, 2026-11-21)
- Date: 2026-11-21
- Related steps: [B3](../https-pwa/04-nginx-tls.md)
- Supersedes: none

## Context
- The existing `smartcare-nginx` container uses `docker/nginx-lan.conf` on 8081/8082 and must keep working until Phase C verification passes.
- WildFly publishes port 8080 on the host and is on a different Docker bridge network from nginx.
- A shared network would require recreating the WildFly container, which is outside this step.

## Decision
- Add `docker/compose.https.yml` containing **only** the nginx service (`smartcare-nginx-https`) on ports 80/443.
- Mount `docker/nginx-https.conf`, `frontends/` and `certs/` read-only.
- Use `extra_hosts: host.docker.internal:host-gateway` so nginx can reach the host-published WildFly.
- Keep `docker/nginx-lan.conf` and its container untouched; do not add a WildFly service to this file.

## Alternatives considered
- **One Compose file with nginx + WildFly + MongoDB**: would require recreating stateful containers and changing networks during Phase B; rejected.
- **Put nginx on WildFly's existing bridge network**: needs container recreation and may break legacy demo; deferred.
- **Publish WildFly only on `127.0.0.1:8080`**: safer but changes how the current demo admin deploys; out of scope.

## Consequences
- Positive: additive rollout, one command to stop (`docker compose -f docker/compose.https.yml down`), legacy path unaffected.
- Negative: WildFly remains reachable on the host's `8080`; hardening is Phase C/D.
- Negative: `host.docker.internal` depends on Docker Desktop/host-gateway support; documented troubleshooting.

## References
- https://docs.docker.com/reference/compose-file/services/#extra_hosts
- https://docs.docker.com/network/drivers/bridge/
