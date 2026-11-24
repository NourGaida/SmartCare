# 01 — Phase A audit (2026-11-21)

## Goal

Record exactly where HTTPS/PWA-relevant code and configuration live, and what the current behaviour is, before changing anything.

## Plain-language explanation

Think of the repository as a small hospital building. nginx is the reception desk that decides which door a visitor uses, WildFly is the clinic behind it, MongoDB is the filing cabinet, and the two frontends are the patient and staff waiting rooms. A PWA is a shortcut on the phone that opens the right waiting room like an app. Before renovating, we walk the building and write down which door is which, who holds the keys (cookies), and what is already installed.

## Why it is needed here

The supervisor must open the patient and staff apps over trusted HTTPS on a phone and install them. The task statement assumed the PWAs did not exist yet; the audit shows they already do, which changes Phase C from "create" to "upgrade". The audit also exposes two blockers that would otherwise make login impossible behind nginx (context path mismatch and server-mode path detection).

## Prerequisites

- Read-only repository inspection: `git status`, `git branch --show-current`, `git log --oneline -5`, `read`, `glob`, `grep`.
- Baseline tests: JDK 25 (`C:\Program Files\Amazon Corretto\jdk25.0.5_0`), Maven 3.10.0, Docker Desktop 29.3.1, MongoDB container `smartcare-mongodb` running on `localhost:27017`.
- No certificates, no admin rights, no phone required for this phase.

## Procedure

### A. Repo tree (2 levels) and component locations

```text
SmartCare/                         (branch before this task: main, HEAD 0b5cd57)
├── .github/workflows/ci.yml
├── .gitignore
├── attribution.md
├── README.md
├── broker/README.md               (placeholder; real broker files are under iot/broker/)
├── cookies.txt, login.json        (gitignored local curl artefacts)
├── docker/nginx-lan.conf          <-- ONLY nginx config in the repo
├── docs/
│   ├── README.md, mqtt-ingestion-audit.md, progress-backend.md
│   ├── assets/, frontend/, iot/, prompts/
├── frontends/
│   ├── README.md
│   ├── frontoffice/               <-- patient app (HTML/CSS/ES modules)
│   ├── backoffice/                <-- staff app (HTML/CSS/ES modules)
│   ├── shared/                    <-- auth, domain, UI, connectivity helpers
│   └── tests/                     <-- Node 22 test suites
├── iot/
│   ├── README.md, broker/, detection/, gateway/, mlops/, simulator/
├── middleware/
│   ├── README.md, pom.xml
│   ├── core/                      <-- ingestion + MongoDB persistence
│   ├── iam/                       <-- sessions, PBKDF2, CSRF token
│   └── api/                       <-- JAX-RS resources, SecurityFilter, WAR
├── scripts/
│   ├── README.md, check-recovery.ps1, demo-duplicate.js,
│   │   publish-test-message.ps1, seed-dev-users.ps1
├── target/, nodered-flow-review.txt, .venv-simulator/
```

| Item | Location | Notes |
| --- | --- | --- |
| nginx config | `docker/nginx-lan.conf` | Two plain-HTTP `server` blocks, `:8081` and `:8082`. |
| Docker Compose / Dockerfile | `iot/broker/docker-compose.yml` (broker only); **none for nginx or WildFly** | `docker ps` shows manually-created `smartcare-nginx` and `smartcare-wildfly` containers. Their exact `docker run` flags are not versioned. |
| Patient app | `frontends/frontoffice/` | `index.html`, `app.js`, `portal.mjs`, `adapter.mjs`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon.svg`. |
| Staff app | `frontends/backoffice/` | `index.html`, `app.mjs`, `views.mjs`, `adapter.mjs`, `manifest.webmanifest`, `sw.js`, icons. |
| WildFly config | No `standalone.xml` or `*.cli` in repo | Deployment is documented via `jboss-cli` in `middleware/README.md:37-41`; runtime is the Docker image `quay.io/wildfly/wildfly:42.0.0.Final-jdk25`. |
| Cookie/session code | `middleware/api/src/main/java/com/smartcare/api/auth/AuthResource.java:57-67`, `middleware/iam/.../session/SessionSettings.java:3-6`, `SessionService.java` | Cookie built in `AuthResource`; settings default to `secureCookie=false`. |
| CSRF code | `middleware/api/.../auth/SecurityFilter.java:50-54`, `middleware/iam/.../security/Csrf.java`, `TokenGenerator.java` | Header `X-CSRF-Token`, constant-time compare, 403 `csrf_invalid`. |
| CORS code | **None found** | No CORS filter, no `@CrossOrigin`, no `Access-Control-*` anywhere. Same-origin is the intended design. |

### B. API call style and every hardcoded URL/IP/port

Runtime frontend modules use **relative / same-origin URLs**, not absolute literals:

- `frontends/shared/server-portal.mjs:6` — `new URL('../../api/', import.meta.url)` → `/api/` from `/frontends/<app>/` **and** from app root.
- `frontends/frontoffice/measurements-adapter.mjs:31` — same pattern, `new URL('../../api/', import.meta.url)`.
- `frontends/shared/server-auth.mjs:14-16` — `fetch(new URL(path, baseUrl), { credentials: 'same-origin', cache: 'no-store' })`.
- `frontends/frontoffice/measurements-adapter.mjs:44` — `credentials: mode === 'server' ? 'same-origin' : 'omit'`.

Hardcoded literals found (none in runtime app code except SVG XML namespaces):

| Location | Literal | Impact |
| --- | --- | --- |
| `docker/nginx-lan.conf:2,19` | `listen 8081`, `listen 8082` | Replaced in Phase B. |
| `docker/nginx-lan.conf:12,29` | `http://host.docker.internal:8080` | Proxy target; keep only if WildFly stays outside the new Compose network. |
| `frontends/tests/frontend.test.mjs:20,42,53` | `http://192.168.1.4:8080/smartcare/api/`, `http://localhost:8080/smartcare/api/` | Test fixtures only. |
| `frontends/tests/integration/patient-history-http.test.mjs:11` | `http://localhost:8080/smartcare/` (env-overridable) | Test fixture only. |
| `frontends/tests/patient-history.test.mjs:14` | `https://smartcare.test/smartcare/api/` | Test fixture only. |
| `README.md:251,260,273,287,294-304,321,325,338,341` | `localhost:27017`, `127.0.0.1:1883`, `localhost:8080`, `127.0.0.1:8081`, `127.0.0.1:5000` | Documentation only. |
| `frontends/README.md:24,30-36,161-163,273,277-278,285,310` | `127.0.0.1:8080`, `localhost:8080/smartcare/...`, `ADRESSE-IP-DU-PC` | Documentation only. |
| `frontends/frontoffice/README.md:10,13,32,117,130,164`, `frontends/backoffice/README.md:13,16` | `127.0.0.1:8081`, `localhost:8080/smartcare/...` | Documentation only. |
| `scripts/README.md:19,40`, `scripts/check-recovery.ps1:18`, `scripts/demo-duplicate.js:1` | `http://localhost:8080/smartcare/api/health/database`, `mongodb://localhost:27017` | Local tooling only. |
| `docs/README.md:50,55-56`, `docs/frontend/*`, `docs/prompts/*`, `iot/**/README.md`, `middleware/**/README.md` | many `localhost:8080/1880/1883/27017` | Historical docs. |
| `frontends/frontoffice/index.html:20`, `frontends/backoffice/index.html` | `http://www.w3.org/2000/svg` | XML namespace, not a network call. |
| `frontends/frontoffice/styles.css:1` | `@import url('https://fonts.googleapis.com/css2?...')` | External font CSS; CSP must allow it or the font must be removed. |

### C. Cookie attributes

Set in `middleware/api/src/main/java/com/smartcare/api/auth/AuthResource.java:57-67` via `NewCookie.Builder`:

| Attribute | Current value |
| --- | --- |
| Name | `SMARTCARE_SESSION` (`SessionSettings.defaults()`, `SessionSettings.java:5`) |
| Path | `/` |
| HttpOnly | `true` |
| Secure | `settings.secureCookie()` → **false** by default; no environment/producer overrides it in `main` code |
| SameSite | **`STRICT`** hard-coded at `AuthResource.java:64` |
| Domain | not set → host-only cookie |
| Max-Age | seconds until `Session.expiresAt()` on login; `0` on logout (`AuthResource.java:53`) |

Session lifetime: idle 30 min, absolute 8 h (`SessionSettings.java:5`). CSRF token is returned in the JSON body of `POST /auth/login` and `GET /session`.

### D. PWA state and tooling

| App | Manifest | SW | Icons | Offline page | Framework/bundler |
| --- | --- | --- | --- | --- | --- |
| Patient | `frontends/frontoffice/manifest.webmanifest` — name `SmartCare Patient`, `id: "./"`, `start_url: "./#dashboard"`, `scope: "./"`, `display: standalone`, theme `#008c95` | `sw.js`, cache `smartcare-patient-static-v6`, explicit static allowlist, no API caching | `icon.svg`, `icon-192.png`, `icon-512.png`; **no 512 maskable**, no 180 apple-touch icon (uses 192) | none (`shared/connectivity.mjs` banner only) | Plain HTML + CSS + ES modules; no npm, no bundler. Node 22 built-in test runner only. |
| Staff | `frontends/backoffice/manifest.webmanifest` — name `SmartCare Supervision`, `id: "./"`, `start_url: "./"`, `scope: "./"`, `display: standalone`, same theme colour | `sw.js`, cache `smartcare-supervision-static-v5`, same allowlist approach | same; staff badge `S` in SVG; no maskable/180 | none | Same. |

Gaps versus the requested end state: no `orientation`, no distinct staff theme colour, no maskable icon, no `offline.html`, `skipWaiting()` on install and `clients.claim()` on activate (auto-update, must become prompt-driven), no `beforeinstallprompt`/install UX, no iOS hint, registration is not after `load`, current SW is network-first for *all* allowlisted static files (not stale-while-revalidate), no navigation-specific strategy.

### E. nginx server blocks

`docker/nginx-lan.conf` (mounted read-only into the existing container at `/etc/nginx/conf.d/default.conf`):

- `server { listen 8081; root /usr/share/nginx/html/frontoffice; location / { try_files $uri $uri/ /index.html; } location /smartcare/ { proxy_pass http://host.docker.internal:8080; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; } }`
- `server { listen 8082; root /usr/share/nginx/html/backoffice; ... identical proxy ... }`
- The `frontends` folder is bind-mounted at `/usr/share/nginx/html` read-only (from `docker inspect smartcare-nginx`). No TLS, no HSTS, no MIME override for `.webmanifest`, no cache policy, no `X-Forwarded-Proto`, no `/api/` proxy.

### F. Risks / blockers

1. **Context mismatch (BLOCKER for login behind nginx):** frontend calls `/api/session`, WildFly serves `/smartcare/api/session`. nginx must rewrite `/api/` → `/smartcare/api/`.
2. **Server-mode detection (BLOCKER):** `frontends/shared/portal.mjs:5` and `frontends/frontoffice/portal.mjs:5` mount the server-aware portal only when `location.pathname.startsWith('/smartcare/frontends/')`. At `https://app.smartcare.local/` the apps would silently fall back to demo fixtures. One-line change per entry file needed in Phase B or C.
3. **Cookie not Secure** (`SessionSettings.defaults()` false) → browser will not send it over HTTPS-only installs if updated to `Secure` but WildFly still sees HTTP without forwarded-header support; needs both changes together.
4. **SameSite=Strict** may still work for same-origin navigation, but the requested value is `Lax`; changing it requires an ADR and code change.
5. **WildFly topology ambiguity:** runtime WildFly is a Docker container on a different bridge network from nginx; the repo's `host.docker.internal` workaround depends on host-published port 8080. No Compose network exists yet.
6. **No nginx Dockerfile/Compose versioned:** must be created; current `docker run` flags are unknown beyond mount/Cmd from `docker inspect`.
7. **CSP vs Google Fonts** (`styles.css:1`): a strict CSP will block the `@import`. Either allow `fonts.googleapis.com`/`fonts.gstatic.com` or drop the import; must be tested.
8. **Lighthouse CLI not installed** (`where.exe lighthouse` → not found); Phase C needs `npx lighthouse` or equivalent and Chrome.
9. **mkcert is installed** (`C:\ProgramData\chocolatey\bin\mkcert.exe`), but phone CA installation is manual; `.local` DNS resolution on Android requires Phase D.
10. **Test-count discrepancy:** task says api 7; baseline actually reports **api 14** (54 core / 11 iam / 14 api). No tests were changed.

## Files created or modified

| Path | Action | Purpose |
| --- | --- | --- |
| `docs/https-pwa/01-audit.md` | added | This audit. |
| `docs/https-pwa/00-overview.md` | added | Current and target request flow. |
| `docs/https-pwa/14-troubleshooting.md` | added | Living problem log, seeded from Phase A. |
| `docs/https-pwa/screenshots-todo.md` | added | Manual screenshot list. |
| `docs/https-pwa/evidence/2026-11-21-baseline-maven.txt` | added | Baseline test evidence. |
| `docs/prompts/00-master-prompt.md` | added | Verbatim master prompt. |
| `docs/CHANGELOG.md`, `docs/GLOSSARY.md` | added | Living registers. |
| `docs/README.md`, `attribution.md` | changed | Index and provenance entries. |

Key config excerpt (current cookie):

```java
// middleware/api/.../AuthResource.java:57-67
new NewCookie.Builder(settings.cookieName()) // SMARTCARE_SESSION
    .path("/").httpOnly(true)
    .secure(settings.secureCookie())         // default false
    .sameSite(NewCookie.SameSite.STRICT)     // hard-coded
```

## Verification

Commands run and results (raw Maven summary saved in `evidence/2026-11-21-baseline-maven.txt`):

| Command | Result |
| --- | --- |
| `git status --short; git branch --show-current; git log --oneline -5` | clean tree on `main`, HEAD `0b5cd57`. |
| `git checkout -b feature/https-pwa` | switched to new branch. |
| `docker ps -a` | `smartcare-nginx`, `smartcare-wildfly`, `smartcare-mongodb` exist but were **Exited**; broker containers were Up. |
| `docker start smartcare-mongodb` | started; required by integration tests. |
| `mvn ... clean verify` (first run, Mongo down) | **BUILD FAILURE**, `MongoTimeoutException`, core 33 run / 1 error. |
| `mvn ... clean verify` (second run, Mongo up) | **BUILD SUCCESS**: core 54, iam 11, api 14; 0 failures, 0 errors, 0 skipped. |
| `where.exe mkcert` | `C:\ProgramData\chocolatey\bin\mkcert.exe`. |
| `where.exe lighthouse` | not found. |
| `java -version` / `mvn -version` | Corretto 25.0.5 on PATH; Maven 3.10.0 defaults to JAVA_HOME `jdk17.0.18_9` — must set `JAVA_HOME` explicitly to JDK 25 for builds. |

Checklist:

- [x] Repo tree and component locations recorded.
- [x] All runtime API calls confirmed same-origin/relative.
- [x] Cookie attributes recorded with file:line.
- [x] PWA assets and framework identified.
- [x] nginx blocks and proxy headers recorded.
- [x] Baseline `mvn clean verify` green with 0 skipped.
- [ ] Supervisor confirmation to proceed to Phase B.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `mvn clean verify` fails with `MongoTimeoutException: localhost:27017` | MongoDB container stopped. | `docker start smartcare-mongodb`, then rerun with `JAVA_HOME` set to Corretto 25. |
| Maven compiles with Java 17 despite `java -version` showing 25 | `JAVA_HOME` points to `jdk17.0.18_9`. | `$env:JAVA_HOME='C:\Program Files\Amazon Corretto\jdk25.0.5_0'` before `mvn`. |
| `frontends/tests/frontend.test.mjs` contains an IP address | Test fixture, not runtime code. | Keep for now; no runtime frontend code contains an IP. Re-check in Phase C. |

## Security notes

- Never commit `rootCA-key.pem`, private keys, `.pem`/`.key`/`.crt`, or `certs/` content. Phase B adds ignore rules; only `certs/README.md` is versioned.
- Session cookie and CSRF token are live credentials: do not paste them into docs or evidence files.
- The demo accounts in `frontends/README.md` are public fixtures, not secrets.

## Rollback

No code was changed. To undo the audit commit: `git checkout main` (or `git reset --hard <previous-branch-head>` if already committed on this branch) and delete the new `docs/https-pwa/` files plus `docs/prompts/00-master-prompt.md`.

## Decisions and alternatives

- Interpreted "no changes yet" as "no code/infrastructure changes"; the docs skeleton and the `feature/https-pwa` branch were created because the documentation policy explicitly requires them in Phase A. ADRs for later choices are deferred to their phases.
- Same-origin `/api/` is preferred over `api.smartcare.local` (no CORS, host-only cookie). Formal ADR comes in Phase B.

## References

- nginx docs: https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- WildFly/Undertow: https://docs.wildfly.org/42/Undertow_Subsystem.html
- MDN service workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- MDN PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- mkcert: https://github.com/FiloSottile/mkcert
- RFC 6265 (cookies): https://www.rfc-editor.org/rfc/rfc6265
