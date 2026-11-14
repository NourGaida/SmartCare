# Repository restructure — confirmed execution brief

Verbatim confirmation received before Steps 1–5. The original Step 0 inventory prompt was sent in the preceding session and is not reproduced here.

```text
Confirmed, proceed to Step 1. Decisions:
1. `DatabaseHealthSource` and its test stay in `middleware/api`, not `core`— that keeps dependencies pointing one way (`api -> core`), and `core` never imports `api`.
2. No `web.xml`; only move `beans.xml`.
3. Set `core.ignorecase=false` for the case-only renames. `git` on Windows may still need two-step `git mv`; that's okay. At the end, verify no tracked paths contain `MiddleWare` or `IoT`.
4. Leave historical docs in `docs/prompts/` untouched. Update live docs only.
5. The user copied `frontends/access-verification.md` and `api-proposal.md` into `frontends/docs/`; delete the originals after verifying the copies match.

Additional instructions:
a. In `.github/workflows/ci.yml`, update the Java build to `mvn -f middleware/pom.xml verify`. Fix the skipped-test gate so it reads `middleware/*/target/surefire-reports/*.xml` instead of a non-existent `target/surefire-reports` at the repo root. The README must document the same command.
b. At the end, run the full frontend checks exactly as CI does, plus the simulator unit test (currently using an import like `from iot.simulator import simulator`). Confirm 24 tests, 0 skipped, the WAR is still `smartcare.war`, context `/smartcare`, and deployment only via `jboss-cli`.
c. Commit one step at a time, then STOP after Step 5.
```
