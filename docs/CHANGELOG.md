# Changelog

Format: date — step id — summary — files — commit hash.

| Date | Step | Summary | Files | Commit |
| --- | --- | --- | --- | --- |
| 2026-11-21 | A | Created branch `feature/https-pwa`; audited nginx/Docker, frontends, WildFly/IAM cookie and CSRF code; created documentation skeleton and baseline Maven evidence (54/11/14 tests, 0 skipped). | `docs/https-pwa/*`, `docs/prompts/00-master-prompt.md`, `docs/CHANGELOG.md`, `docs/GLOSSARY.md`, `docs/README.md`, `attribution.md` | `be7d98d` |
| 2026-11-21 | A | Added this CHANGELOG and public-repo contribution guidance. | `docs/CHANGELOG.md`, `docs/https-pwa.md` | `a78f3bd` |
| 2026-11-21 | preflight | Scrubbed personal Windows paths from prompt docs, corrected API test count to 14, documented JDK 25/MongoDB prerequisites and local tool versions. | `attribution.md`, `docs/progress-backend.md`, `docs/prompts/*`, `middleware/README.md` | `5cdb931` |
| 2026-11-21 | B1 | Added idempotent admin-run hosts-file script and step doc; host verification still UNVERIFIED pending user elevation. | `scripts/setup-hosts.ps1`, `docs/https-pwa/README.md`, `docs/https-pwa/02-hostnames.md`, `docs/https-pwa/evidence/2026-11-21-hostnames.txt`, `docs/decisions/ADR-0001-local-hostnames.md`, `docs/https-pwa/screenshots-todo.md`, `docs/https-pwa.md`, `docs/https-pwa/00-overview.md`, `docs/CHANGELOG.md` | `6a8171c` |
| 2026-11-21 | B2 | Added mkcert local-CA script, git-ignored cert storage, wildcard SANs and ADR; certificate creation UNVERIFIED pending user UAC. | `.gitignore`, `scripts/gen-certs.ps1`, `certs/README.md`, `certs/.gitkeep`, `docs/https-pwa/03-local-certificates.md`, `docs/https-pwa/evidence/2026-11-21-mkcert.txt`, `docs/decisions/ADR-0002-mkcert-local-ca.md`, `docs/https-pwa/screenshots-todo.md`, `docs/https-pwa/README.md`, `docs/CHANGELOG.md` | `047075a` |
