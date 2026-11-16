# Procedure — the gate: the one reviewer that is not a language model

An agent is only useful inside a closed loop: propose → objective feedback → correct → repeat
**until green**. A loop with nothing that can say NO is the agent agreeing with itself. Each
service's gate is the command in the Services table of `.ai/orchestrator.md`, run with the bash
tool's `workdir` set to that service's folder. There is no build of the whole system.

## The tool — NEW findings block, PRE-EXISTING ones never do

`node .ai/scripts/ai.mjs gate` (from the workspace folder) runs the checks of every service with changes, each
in its own repository and exec environment (`.ai/project.json`: ddev, docker compose or local), and lists the
**contracts between services** the change touched. Every finding is split:

- **NEW** — on a line this change touched, or in a new file: this ticket's. They fail the gate.
- **PRE-EXISTING** — anywhere else in the files checked: the first three in the output, all of them in
  `.ai/context/last-gate.<service or stack>.md` (`gate --full` prints them all); never blocking, never "fixed" on the side
  (a refactor nobody asked for is scope creep; propose a ticket instead).

What it runs per stack: **Java** — compile, Checkstyle (when the build has it), the JUnit results (a failing test
always fails); **Drupal** — phpcs and phpstan on the changed files, hook signatures against the installed core,
`drush cache:rebuild`, a smoke request, `config:status`; **React + TypeScript** — eslint, `tsc`, the tests; **anything else** —
the commands set in project.json. It ends with `[VERIFIED <date> @<sha> — "<evidence>"]` lines and
`RESULT: PASS | FAIL | INCOMPLETE` — INCOMPLETE (a check could not run) is never reported as green.
One service: `node .ai/scripts/ai.mjs --service <service> gate`; a base other than HEAD: `--base <ref>`.
**Always through the tool** (or `/gate`, which runs it and iterates): never phpcs, phpstan, drush, mvn, eslint or tsc
by hand, nor through `node -e` — a check run by hand has no NEW / PRE-EXISTING split and its evidence is not the
gate's. With opencode on Windows and the project in WSL, `ai.mjs` runs itself inside WSL (git, ddev, drush are there).

The tool is fast and scoped to the change; the **Services table's gate** (e.g. `mvn verify`) is the full build.
Use the tool in the inner loop and after every phase; the table's gate before the review and at close. A check
the project went without (`node .ai/scripts/ai.mjs qa --off`) is SKIPPED, by decision — say so in the report.

## SonarQube (when a service is SonarQube-tracked)

A service is on SonarQube when it has its own `sonar.projectKey` (`sonar-project.properties`, `pom.xml`, or
`"sonar"` in its entry of `.ai/project.json`): `node .ai/scripts/ai.mjs qa` lists a `sonar` row for each one.
For those, "green" also includes SonarQube — **not green until Sonar reports zero new issues (any severity/type)
on the new/changed code, the quality gate is Passed, and coverage on the changed code meets the threshold**:

- **Java** — per `.ai/rules/sonarqube.md` (installed with the Java stack): once `mvn test` is green, post the scan
  and query the gate.
- **Any stack** (Drupal, React…) — `node .ai/scripts/ai.mjs gate --sonar` at the end of the ticket: for every service
  the ticket changed it posts the analysis of the branch (Maven: the sonar-maven-plugin; otherwise `sonar` /
  `sonar-scanner`), waits for SonarQube to process it and reads the quality gate, the new issues and the new
  coverage. It does the Java steps in one go too.

`SONAR_URL` and the developer's own `SONAR_TOKEN` live in the environment — never in a file. A service without a key
is not on SonarQube: nothing to do.

## When it runs

| Moment | What runs |
|---|---|
| Intake | Nothing — only the `baseline` sha is recorded |
| Before the first code change of a service | The full gate of that service, once: the starting point is known green (or known red — say so) |
| Inner loop | The single test class or module (Java: `mvn -pl <module> test -Dtest=<Class>`; Drupal: `ddev exec vendor/bin/phpunit <file>`) — and `node .ai/scripts/ai.mjs gate` after each phase |
| Before the review | The full gate of every service touched |
| A changed contract or library | Also the gate of every consumer changed in the ticket |

## How a result is recorded

- **The receipt — written by the tool, never by you.** Each run of `ai.mjs gate` writes one line in your diary
  of the active ticket, section `## Receipts` (`- gate project · <date time> · exit 0 · "RESULT: PASS" · @<sha> · #<hash>`),
  and keeps the full output in `.ai/context/receipts/` (local). The next step and the close read the receipt: a
  `## Changes` edit after it makes the gate stale, so run it again. Never write or edit a receipt line by hand;
  when you report a gate, quote its `RESULT` line exactly as the receipt has it.
- The gate's own result is its receipt: nothing to copy into `## Verification` (the close folds the receipt into
  one line there). The other checks (a regression test, a flow exercised by hand, a human's run) are written by you:
- Green → `[VERIFIED <date> @<sha> — "<evidence>"]` where `<evidence>` is the output line that proves
  it: `BUILD SUCCESS` · `Tests run: 214, Failures: 0, Errors: 0`. The sha is the service's HEAD (or
  the working tree it ran on, with "dirty" noted). Without the evidence fragment the claim is not
  verified — a truncated or timed-out run never becomes "green".
- A regression test for a logic bug is written **before** the fix and run twice: red first — paste
  the failing assertion as the evidence — then green after the fix. A test that was never red proves
  nothing.
- The gate exceeds the tool's timeout → do not report it as anything. Ask the human to run it and
  give you the summary line: `[VERIFIED-BY-HUMAN <date> @<sha> — "<line>"]`.
- `mvn` cannot run at all (no `settings.xml` for the internal repository, IDE-only module) → the
  service's `service.md` → Specific restrictions must say so; the result is `[ASSUMED]` and the
  human verifies by the manual procedure.
- The gate of a service is itself `[ASSUMED]` in the Services table (never confirmed) → every green
  of this session is provisional; say it in the report.

## Stop conditions

- ❌ Red after the first attempt → the diagnosis was incomplete: back to the evidence, not a patch on
  top of the patch.
- 🛑 Red after 2–3 diagnostic iterations → the root cause is elsewhere. Stop, record a `Dead end:`,
  and rethink with the human.
- 🛑 The fix widens beyond the ticket's `services:` or `Boundaries` → stop; update the ticket first.
- Never finish an iteration with a broken build. Iterate until green and STOP for the human's
  validation; never auto-merge.
