# Prompt 00 — master HTTPS/PWA prompt

- Date: 2026-11-21
- Phase driven: A–D (master prompt)
- Model/tool: opencode / Big Pickle
- Summary: branch `feature/https-pwa`, audit first, then local HTTPS for two nginx-served frontends, PWA upgrades, phone access fallback, and a full documentation/attribution trail.
- Corrections by the user after this prompt: none yet (awaiting Phase A confirmation).

## Verbatim prompt

```text
# TASK: SmartCare, make both web apps installable PWAs over local HTTPS

## 0. Context
SmartCare is an IoT patient-monitoring system (SUP'COM project, repo: github.com/NourGaida/SmartCare, branch convention: one branch per task).

Current state:
- Backend: Java 25 (Corretto), Maven, multi-module middleware (core, iam, api), Jakarta EE JAX-RS on WildFly 42.0.0.Final.
- Database: MongoDB (Java Sync Driver 5.5.1). Broker: Eclipse Mosquitto (MQTT).
- Auth: server-side sessions, HttpOnly + SameSite cookies, CSRF token on every state-changing request, PBKDF2 passwords. Only /health and /login are public.
- Frontends (written by a teammate, Hadil): a patient app (served by nginx on port 8081) and a staff app (port 8082). They must become installable web apps (PWA).
- nginx (Docker) serves both frontends and forwards API calls to WildFly. WildFly is reachable at 192.168.1.4:8080 on the LAN.
- Dev machine: Windows, PowerShell, Docker Desktop, jboss-cli available.

Goal: the supervisor must be able to open the app on his phone over HTTPS and install it to the home screen, with login/logout/CSRF working in installed mode.

## 1. Ground rules
- Create a new git branch `feature/https-pwa`. Make small, atomic commits with clear messages.
- Read the repo before changing anything. Do not assume paths: locate the nginx config, the Dockerfile/compose files, the two frontend folders, the WildFly config scripts and the IAM session/cookie code first.
- Do NOT break existing tests (core 54, iam 11, api 7 must still pass: `mvn clean verify`). Run them before and after.
- NEVER commit secrets or certificates: add `*.pem`, `*.key`, `*.crt`, `certs/` and `rootCA*` to `.gitignore`. Commit only a `certs/README.md` explaining how to generate them.
- Do not hardcode IPs or hostnames in frontend code. All API calls must use the relative path `/api/...`.
- Do not cache anything from `/api/` in any service worker (medical data, session, CSRF token).
- Keep frontend changes minimal and isolated (new files + a few lines in index.html), since a teammate owns that code. Do not refactor her components.
- Windows-friendly: provide PowerShell commands, not bash-only ones.
- Be precise and explain nothing I did not ask for; but report every assumption you make.

## 2. PHASE A: Audit (no changes yet)
Produce a short written audit and STOP for my confirmation. It must list:
1. Repo tree (2 levels) and where each of these lives: nginx config, docker files, patient app, staff app, WildFly config, cookie/session code, CORS/CSRF code.
2. How the frontends currently call the API (absolute URLs vs relative). List every hardcoded URL/IP/port you find (grep for `192.168`, `localhost`, `8080`, `8081`, `8082`, `http://`).
3. Current cookie attributes (Secure, HttpOnly, SameSite, Domain, Path) and where they are set.
4. Whether the frontends already have a manifest, service worker, icons, and what framework/bundler they use (plain HTML, Vite, React, Angular...).
5. Current nginx server blocks, ports and proxy headers.
6. Risks or blockers you foresee.

## 3. PHASE B: Local HTTPS (branch `feature/https-pwa`)

### B1. Hostnames
Target names (same names for dev and prod, per supervisor requirement):
- `app.smartcare.local` (patient app)
- `staff.smartcare.local` (staff/back-office app)
- `api.smartcare.local` (optional; prefer same-origin `/api/` on each app host to avoid CORS and cross-subdomain cookie problems)

Provide a PowerShell script `scripts/setup-hosts.ps1` (requires admin) that adds the entries pointing to the machine's LAN IP (take it as a parameter, default 192.168.1.4) idempotently, without duplicating lines.

### B2. Certificates
- Write `scripts/gen-certs.ps1` using mkcert: `mkcert -install`, then generate `certs/smartcare.pem` and `certs/smartcare-key.pem` for the three hostnames plus `localhost` and the LAN IP.
- The script prints the path of `rootCA.pem` (from `mkcert -CAROOT`) and copies ONLY `rootCA.pem` to `certs/rootCA.pem` for transfer to phones. It must never copy `rootCA-key.pem`.
- Document phone installation (Android and iOS steps) in `certs/README.md`.

### B3. nginx TLS
Rewrite the nginx config (keep existing behavior, add TLS):
- Port 443 ssl with `http2`, certs mounted read-only from `./certs`.
- One server block per host: `app.smartcare.local` -> patient app root, `staff.smartcare.local` -> staff app root. SPA fallback `try_files $uri /index.html`.
- `location /api/` proxies to WildFly with: `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto https`, `X-Forwarded-Host`. Use `host.docker.internal:8080` if WildFly runs on the Windows host, or the compose service name if it is containerized (check which applies).
- If SSE/WebSocket will be used later, leave a commented `location` with `proxy_buffering off` and `proxy_read_timeout`.
- Port 80: redirect everything to https.
- Security headers: `Strict-Transport-Security` (short max-age for dev), `X-Content-Type-Options nosniff`, `Referrer-Policy no-referrer`, a reasonable `Content-Security-Policy` that does not break the apps (test it, loosen only if needed and tell me why).
- `sw.js` and `manifest.webmanifest`: `Cache-Control: no-cache`. Hashed static assets: long cache. Correct MIME type for `.webmanifest` (application/manifest+json).
- Update `docker-compose`/Dockerfile so nginx publishes 443 and 80 and mounts `certs/`.

### B4. WildFly behind the proxy
- Configure Undertow to trust the forwarded headers so the app sees HTTPS: `proxy-address-forwarding=true` on the http-listener. Provide the exact `jboss-cli` commands in `scripts/wildfly-proxy.cli` and make them idempotent. Do not change anything else in standalone.xml.
- Make session cookies `Secure` when `X-Forwarded-Proto` is https (or always Secure in non-dev profile). Keep HttpOnly. Choose SameSite=Lax unless the audit shows a need for Strict or None; justify the choice in a code comment.
- Verify the CSRF token flow works over HTTPS and same-origin `/api/`.

### B5. Firewall
Provide `scripts/firewall.ps1` that opens TCP 80/443 (inbound, Private profile) and optionally removes the old 8081/8082 rules. Idempotent.

### B6. Verification for Phase B (run and report results)
- `curl.exe -vk https://app.smartcare.local/api/health` returns 200 through nginx (with the mkcert CA trusted, drop `-k`).
- Login via curl with cookie jar over HTTPS, then `GET /api/auth/me` (use the real route name), then a state-changing call with and without CSRF header (expect 403 without).
- Confirm `Set-Cookie` contains `Secure; HttpOnly; SameSite=...`.
- `mvn clean verify` still green.
Then STOP and summarize before Phase C.

## 4. PHASE C: PWA for BOTH frontends

For each app (patient and staff) independently:

### C1. Manifest
Create `manifest.webmanifest` with: distinct `name`/`short_name` ("SmartCare" / "SmartCare Staff"), `id`, `start_url "/"`, `scope "/"`, `display "standalone"`, `orientation "portrait"` for patient (any for staff), `lang "en"` (or the app language), `theme_color`, `background_color`, and icons 192x192, 512x512 and a 512 maskable. Different colors per app so both can be told apart on the phone.

### C2. Icons
Generate the PNG icons programmatically from a single SVG source (use a script with sharp or ImageMagick if available; otherwise create simple SVG-to-PNG via Node). Put sources in `design/` and outputs in each app's `icons/`. Also add `apple-touch-icon` (180x180) and a favicon.

### C3. Service worker
Write `sw.js` (plain, no heavy library unless the project already uses Workbox/Vite PWA plugin; if it does, use that and say so):
- Precache the app shell (HTML, JS, CSS, icons, offline page) with a versioned cache name.
- Navigation requests: network-first with fallback to cached shell/offline page.
- Static assets: stale-while-revalidate.
- `/api/*` and any non-GET request: NEVER cached, always network. On failure return a clean JSON/offline error, not a cached response.
- `activate`: delete old caches. `skipWaiting` only via an explicit update prompt, not automatically.
- Create a simple `offline.html` in the same visual style.

### C4. Registration and HTML head
- Add to index.html: manifest link, `theme-color`, `viewport` with `viewport-fit=cover`, apple meta tags (`apple-mobile-web-app-capable`, status bar style, title).
- Register the service worker only in secure contexts, after `load`. Add a small, unobtrusive "update available / install app" handling: capture `beforeinstallprompt` and show an optional Install button; on iOS show a one-line hint on how to Add to Home Screen. Keep UI changes minimal and styled with existing classes.

### C5. Login in installed mode
- Make sure all fetch calls use `credentials: 'same-origin'` (or 'include' if cross-origin is unavoidable, justify) and send the CSRF header on every state-changing request.
- On any 401 from the API, redirect to the login screen and clear client state. Test that logging out in the installed app works and that the session cookie is cleared.

### C6. Verification for Phase C
- Run Lighthouse (CLI, PWA/installability audit) against both https hosts and save the reports to `docs/pwa-audit/`.
- Chrome DevTools-equivalent checks via Lighthouse: manifest valid, SW controls the page, installable, offline page served when network is off.
- Provide a manual test checklist `docs/pwa-test-checklist.md` for Android Chrome and iOS Safari: trust CA, open URL, install, login, logout, airplane-mode launch, update flow.

## 5. PHASE D: Phone access fallback
Provide `docs/phone-access.md` with two documented options:
1. Local DNS: a small dnsmasq container (compose profile `lan-dns`) answering `*.smartcare.local` with the LAN IP, plus how to set the phone's Wi-Fi DNS to the PC's IP.
2. Demo tunnel: Cloudflare Tunnel commands to expose the nginx HTTPS endpoint with a public HTTPS URL, with its caveats (needs internet, temporary URL, make sure the app works with the changed Host).
Mark which one is recommended for the supervisor demo and why.

## 6. Documentation and attribution (required by supervisor)
- Update the root README and each frontend README with: how to run with HTTPS, hostnames, certificate generation, how to install the PWA.
- Update `attribution.md`: list any new libraries/tools you introduced (mkcert, sharp, lighthouse, dnsmasq, cloudflared...) and add an entry recording that this work was done with AI coding assistance, including a summary of this prompt.
- Add a `docs/https-pwa.md` architecture note (request flow: phone -> nginx 443 -> WildFly 8080 -> MongoDB, with where TLS terminates).

## 7. Acceptance criteria
- [ ] `https://app.smartcare.local` and `https://staff.smartcare.local` load with no certificate warning once the CA is trusted.
- [ ] Both apps pass the Lighthouse installability checks and install on Android Chrome; iOS Add-to-Home-Screen works.
- [ ] Login, `who am I`, logout and CSRF-protected requests work in installed mode.
- [ ] No frontend code contains hardcoded IPs/ports; no `/api/` response is ever cached by a service worker.
- [ ] Cookies are Secure + HttpOnly + SameSite.
- [ ] No secrets or certificates are committed; `.gitignore` updated.
- [ ] `mvn clean verify` passes with 0 skipped tests; existing tests unchanged.
- [ ] All scripts are idempotent and documented.

## 8. Output format
After each phase, reply with: (1) what you changed (file list), (2) commands you ran and their results, (3) assumptions made, (4) anything that needs my manual action (e.g. admin PowerShell, installing the CA on the phone), then wait for my "continue". Do not proceed to the next phase without it. ## 6. DOCUMENTATION POLICY (applies to EVERY phase and EVERY step)

Documentation is a deliverable, not an afterthought. A step is NOT done until its doc exists, is accurate, and is committed in the same commit series as the code. Never batch docs to the end.

### 6.1 Folder structure (create it in Phase A)
```
docs/
  README.md                      # index: links to every doc below, in reading order
  https-pwa/
    00-overview.md               # architecture + request flow + diagram (Mermaid)
    01-audit.md                  # Phase A findings
    02-hostnames.md              # B1
    03-certificates.md           # B2
    04-nginx-tls.md              # B3
    05-wildfly-proxy-cookies.md  # B4
    06-firewall.md               # B5
    07-https-verification.md     # B6
    08-pwa-manifest-icons.md     # C1, C2
    09-service-worker.md         # C3
    10-registration-install-ux.md# C4
    11-login-installed-mode.md   # C5
    12-pwa-verification.md       # C6
    13-phone-access.md           # Phase D
    14-troubleshooting.md        # consolidated, grows with every step
  decisions/                     # one ADR per significant choice (ADR-001-....md)
  prompts/                       # one file per prompt used (see 6.5)
  CHANGELOG.md                   # dated, one entry per step
  GLOSSARY.md                    # HTTPS, TLS, CA, mkcert, PWA, manifest, service worker, CSRF, SameSite, reverse proxy...
```
Each frontend folder keeps its own short README that links to the matching docs.

### 6.2 Mandatory template for every step doc
Use exactly these sections, in this order:
1. **Goal**: one sentence.
2. **Plain-language explanation**: 3 to 6 lines with an everyday analogy, written for a reader who has never seen this technology (e.g. certificate = ID card, CA = the authority the phone trusts, reverse proxy = reception desk).
3. **Why it is needed here**: tie it to the SmartCare requirement (supervisor installs the app on his phone).
4. **Prerequisites**: tools, versions, admin rights, earlier steps.
5. **Procedure**: numbered steps, each with the exact command (PowerShell) in a code block, the expected output, and what to do if it differs.
6. **Files created or modified**: table with path, action (added/changed), and one-line purpose. Include the key config excerpts with comments explaining each non-obvious line.
7. **Verification**: exact commands/checks, expected results, and a pass/fail checkbox list.
8. **Troubleshooting**: at least 3 realistic problems with symptom, cause, fix (also append them to `14-troubleshooting.md`).
9. **Security notes**: what must never be committed or shared, and why.
10. **Rollback**: how to undo this step cleanly.
11. **Decisions and alternatives**: what was chosen, what was rejected, why (link the ADR).
12. **References**: official docs only (nginx, WildFly/Undertow, MDN, web.dev, mkcert, RFCs), with URLs.

### 6.3 Diagrams and evidence
- Use Mermaid diagrams (sequence or flowchart) in `00-overview.md` and wherever a flow is explained: phone -> DNS -> nginx:443 -> WildFly:8080 -> MongoDB, TLS termination point, login/CSRF sequence, service worker caching strategy per request type.
- For anything visual (Lighthouse score, install prompt, certificate padlock, phone trust screen), create the placeholder `docs/img/<step>-<description>.png` reference in the doc with an HTML comment `<!-- TODO screenshot: ... -->`, and list all pending screenshots in `docs/https-pwa/screenshots-todo.md` so I can capture them manually.
- Save raw outputs of verification commands (curl, mvn, lighthouse summaries) into `docs/https-pwa/evidence/` as text files and link them.

### 6.4 Living documents
- `CHANGELOG.md`: add an entry after every step: date, step id, summary, files, commit hash.
- `decisions/ADR-xxx`: write one for each of: hostname scheme, mkcert vs other CA, TLS at nginx rather than WildFly, same-origin `/api/` vs separate API host, SameSite value, service worker strategy (hand-written vs Workbox), what is never cached, tunnel vs local DNS. Format: Context, Decision, Consequences, Alternatives.
- `14-troubleshooting.md` and `GLOSSARY.md`: update at each step.
- Keep `docs/README.md` index current; every doc must be reachable from it.

### 6.5 Attribution and prompt log (supervisor requirement)
- `attribution.md` at repo root: list every library/tool introduced (name, version, licence, purpose, URL).
- `docs/prompts/NN-<topic>.md`: store each prompt given to you verbatim, with date, the phase it drove, a summary of what you produced from it, and what I corrected afterwards. Include THIS prompt as `00-master-prompt.md`.
- State clearly in `attribution.md` that code and docs were produced with AI coding assistance (opencode) and reviewed by the team.

### 6.6 Quality rules for the writing
- English, concise, technical, no filler. Every command must be copy-pasteable on Windows PowerShell.
- Never document something you did not actually run or verify. Mark anything untested as `UNVERIFIED` and list it at the end of the doc.
- Do not invent version numbers, route names, or paths: read them from the repo.
- Never put real secrets, tokens, private keys, or personal data in docs or screenshots.
- Link, don't duplicate: reference the config file path instead of pasting the whole
```
