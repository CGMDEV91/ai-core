---
description: SonarQube gate — post the scan, then check new issues, quality gate and coverage before green
globs: ["**/*.java"]
alwaysApply: false
---

## SonarQube — verification gate after code changes

Applies to changes in SonarQube-tracked source. Runs **after** `mvn compile` and `mvn test` are
green, **before** the task/step is marked Done. If the project is not SonarQube-tracked, this rule
does not apply.

### Process (agent-driven)
1. **Post the scan.** The SonarQube MCP server is **read/query only** — it does not run a full
   project scan. Post the analysis first, from the module directory that owns the change:
   `mvn org.sonarsource.scanner.maven:sonar-maven-plugin:<current-stable>:sonar -Dsonar.host.url=<SONAR_HOST> <BRANCH_FLAG>`
   - `<SONAR_HOST>` is the machine's `SONAR_URL` environment variable. Do not hardcode a host in this
     file and never ask for it each session.
   - `<BRANCH_FLAG>` files the analysis under the **current git branch**: get it with
     `git rev-parse --abbrev-ref HEAD`. On the **default branch** (`main` / `master`) leave it empty
     (SonarQube treats that as the main branch); on any other branch set
     `-Dsonar.branch.name=<branch>`. Branch analysis needs SonarQube **Developer edition+** — on
     Community everything is the main branch, so omit the flag.
   - The token is read from the `SONAR_TOKEN` environment variable (standard SonarQube scanner
     mechanism) — **never** put it on the command line, in a log or in a file.
   - `<current-stable>`: verify the current stable `sonar-maven-plugin` version before first use;
     do not guess. Known-good reference: `5.8.0.7211` `[VERIFIED 2026-10-02]`.
     - **The scanner needs a JDK 17 or higher, independent of the project's Java version.** If the
       default `JAVA_HOME` is older (e.g. Java 8), the scan fails with `UnsupportedClassVersionError`.
       Resolve a JDK 17+ — current `JAVA_HOME` if it is 17+, else any JDK 17+ under `~/.jdks`, else
       download Temurin 17 into `~/.jdks` — and use it **per-command** for the scan (bash:
       `JAVA_HOME="<jdk17>" mvn ...`; PowerShell: `$env:JAVA_HOME = "<jdk17>"; mvn ...`). **Do not
       change the machine `JAVA_HOME`.** The scanner then provisions its own engine JRE.
   - **Run `mvn test` first** so a JaCoCo report exists — the `sonar` goal alone reports 0.0 coverage.
   - **Windows/PowerShell:** quote each `-D` arg (`"-Dsonar.host.url=..."`) — unquoted values split on `://`.
   - Do **not** add the plugin to any `pom.xml` — invoke it by full coordinates.
   - **The scan needs a bash permission for `mvn org.sonarsource.scanner.maven:*`.** In opencode that
     rule must sit in the **top-level** `permission.bash` — a rule placed under
     `agent.<name>.permission` only applies to that agent's own commands and the scan silently stays
     denied for the build agent. `[VERIFIED 2026-11-05 — EUIPOBO-38591]`
   - Alternative: the human triggers the scan from the IDE's SonarQube plugin; the agent then only
     does step 2.
2. **Identify the Sonar project, then query the results.** First find which SonarQube project this
   module belongs to — do **not** guess the key:
   - Look for `sonar.projectKey` in `sonar-project.properties` / `pom.xml` / the build files.
   - Confirm it exists via the MCP `search_my_sonarqube_projects` (search by that key or name).
   - If you **cannot find it, ask the user** for the project key before querying.
   Then query via the `sonarqube` MCP tools, scoped to that project key
   (e.g. `search_sonar_issues_in_projects` with `inNewCodePeriod: true`):
   - **New issues** — **zero new issues of any severity or type** (Blocker → Info; bug /
     vulnerability / code smell) in the new code.
   - **Quality gate** — must be **Passed**.
   - **Coverage** — line + branch on the changed code meets the project threshold.
   - **Security hotspots** — review any new ones.
3. **Fix and re-scan** if anything is red. Limit the loop (max iterations, stop condition); 2–3
   failed diagnoses → stop and rethink with the human.

### Branch analysis vs Pull-request analysis (different new-code periods)

The branch scan (`-Dsonar.branch.name`) and the PR analysis (Jenkins, or a scan posted with
`-Dsonar.pullrequest.*`) can disagree on the same code; the PR gate is the one that blocks the merge.
Two consequences:

- **`sonar.exclusions` covers main code only — test files need `sonar.test.exclusions`.** The PR
  analysis includes `src/test/**`, so a pom with only `sonar.exclusions` still flags test issues
  (e.g. `java:S1128` unused imports in test builders) and can turn the PR gate red while the branch
  scan stays green. Add `<sonar.test.exclusions>**src/test/**</sonar.test.exclusions>` to the poms.
  `[VERIFIED 2026-11-05 — EUIPOBO-38591, PR 53]`
- **Verifying a PR gate locally** (without waiting for Jenkins): discover the real PRs with the MCP
  `sonarqube_list_pull_requests` (match the source branch) and post the scan with
  `"-Dsonar.pullrequest.key=<key>" "-Dsonar.pullrequest.branch=<branch>" "-Dsonar.pullrequest.base=<base>"`
  — the scanner then reports at `/dashboard?...&pullRequest=<key>`. Never invent a key: the mc1arke
  plugin accepts any key and creates a phantom PR analysis with no Bitbucket PR behind it. The scan
  reads the **working tree** (uncommitted changes included) — a **preview** of the future gate,
  always replaced by the authoritative Jenkins analysis after the push. Pre-existing issues in the
  PR's new-code period do not block the gate unless they push a rating over its threshold (e.g.
  `new_maintainability_rating` > 1). If the PR does not exist yet, there is no PR gate to verify —
  the branch scan is the applicable verification.

### Green (part of Definition of Done)
- Quality gate **Passed** · **zero new issues (any severity/type)** · coverage on changed code OK ·
  no unreviewed new security hotspots.

### Non-negotiables
- Token comes only from the `SONAR_TOKEN` env var. Never hardcode, log, print or commit it — not at
  DEBUG level, not in an exception message.
- The host comes only from the `SONAR_URL` env var. Never hardcode it in this file and never ask for
  it each session.
- The MCP server reads; the scanner (or IDE plugin) posts. Do not claim a scan ran if it did not.
