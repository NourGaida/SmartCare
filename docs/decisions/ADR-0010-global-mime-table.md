# ADR-0010 — Global MIME table instead of location overrides

- Status: Accepted (2026-11-21)
- Date: 2026-11-21
- Related steps: [B6](../https-pwa/07-https-verification.md)
- Supersedes: the location-level `types` snippet introduced by the previous B6 incident fix.

## Context
- `GET https://app.smartcare.local/` returned `200` with `Content-Type: application/octet-stream`, so Chrome downloaded the page. `GET /index.html` returned `text/html`.
- `location /` uses `try_files /frontoffice$uri /frontoffice$uri/ /frontoffice/index.html`. For `/`, the directory match causes an internal redirect to `/frontoffice/index.html`, which is served by `location ^~ /frontoffice/` on the patient host and `location ^~ /backoffice/` on the staff host.
- Those prefix locations included `docker/nginx-mime-types.conf`, a hand-written `types { ... }` block with only eight extensions. In nginx, `types` is **not additive**: a `types` block in a more specific context replaces the entire inherited table. With no `text/html html htm;` mapping, nginx fell back to `default_type application/octet-stream`.
- `X-Content-Type-Options: nosniff` remained enabled. Once the type was wrong, `nosniff` correctly prevented Chrome from guessing `text/html`, producing a download instead of a rendered page.

## Decision
- Remove every location-level `types` override and `default_type` workaround from `docker/nginx-https.conf`.
- Mount `docker/nginx-mime-types.conf` as `/etc/nginx/mime.types`, the global table already included by nginx at `http` scope. The file is the complete `nginx:stable` table plus the two project-specific mappings:
  - `text/javascript mjs;`
  - `application/manifest+json webmanifest;`
- Keep `add_header X-Content-Type-Options "nosniff" always;` in `docker/nginx-security-headers.conf`.
- Add a static CI assertion that `docker/nginx-https.conf` contains no `types` or `default_type` override and that the global table still contains `text/html`, `ico`, `json`, `mjs` and `webmanifest`.

## Why this option
- A complete global table cannot be silently dropped by a future location snippet, because there is no longer a second, partial `types` table to drift out of sync.
- Extending the old eight-line snippet would have fixed today's `text/html` symptom but left the same class of bug for `ico`, `json` or any future standard type.
- Narrow regex overrides for `.mjs`/`.webmanifest` would still leave hand-maintained `types` blocks in the config and invite the same mistake.

## Alternatives considered
- Add `text/html`, `image/x-icon ico;`, `application/json json;` and other missing types to the existing snippet: rejected because it remains an incomplete replacement table.
- Keep prefix `types` blocks and add only the missing extensions: rejected for the same reason.
- Rely on `default_type text/html`: rejected because it would mislabel genuine binaries and hide future MIME regressions.

## Consequences
- Positive: all locations inherit one complete table, including internally redirected ones.
- Positive: `nosniff` stays effective because the advertised type is now correct.
- Negative: the global table must be refreshed when the nginx base image changes its standard MIME list; CI checks cover the extensions this project uses.
- Negative: one additional file is mounted read-only into the container.

## Verification
- Before fix: `/`, `/frontoffice/index.html` and `/backoffice/index.html` returned `application/octet-stream` on both hosts.
- After fix: smoke script asserts `text/html` for `/`, `/index.html`, `/frontoffice/index.html` and `/backoffice/index.html` on both hosts, plus the expected types for css, mjs, svg, png, woff2, json and webmanifest.

## References
- [nginx `types` directive](https://nginx.org/en/docs/http/ngx_http_core_module.html#types)
- [Global MIME table](../../docker/nginx-mime-types.conf)
- [nginx HTTPS config](../../docker/nginx-https.conf)
- [ADR-0009](ADR-0009-service-worker-kill-switch.md)
