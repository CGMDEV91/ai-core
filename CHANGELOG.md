# Changelog

## 0.19.1 — 2026-11-12

- **One person, one diary.** opencode on Windows has no git, so its edit-tracking plugin named the diary after the
  Windows login (`EUIPOFO-123.cgonzale.md`) while the agent, running in WSL, used `git config --global user.name`
  (`EUIPOFO-123.carlos-gonzalez.md`). Setup now saves who you are in `.ai/user.local.json` (git-ignored) and every
  process reads it first; without it, a Windows process asks git inside WSL instead of using the Windows login.
  `/doctor` shows the row **you**. `cli knowledge merge-user <from> <to>` joins the diaries of the same person (no
  duplicate lines) and fixes plan owners. The selftest checks that Windows and WSL give the same name.
- `impact --stale-skills` prints only skills (the "No changed files" line was read as a skill name); the selftest
  does not inherit `GIT_*` from the pre-push hook.

## 0.19.0 — 2026-11-12

- **Impact, touchpoints and call paths on every stack.** One impact engine in core with a profile per stack (Drupal's
  output is identical — the 17 golden snapshots did not change): React and Java map a changed line to its method with
  the code index, cite methods as `Class::method()`, `Class.method()`, `Component()`, `useHook()`, and read a module as
  the feature folder (React) or the package (Java). Generic `callpaths` (skills' call paths from the code index) and
  `touchpoints` (grouped per stack: React routes, state, API calls, hooks, i18n; Java controllers, entities, config,
  migrations, messages) in core; Drupal keeps its PHP resolver and its own grouping. `references` moved to core.
  Workspaces: impact reads the diff of every service.
- **A skill is the source of truth; tickets are history.** `## History` in the skill template; the rules in force are
  rewritten in the skill, the ticket keeps the reference. Without a skill the newest ticket on the same code wins and
  older ones are marked `Superseded by …`.
- **Stale skills**: `impact --stale-skills` lists the skills whose cited methods or call path the ticket changed;
  ▶ Next and `/close` require `/skill` to update each one (an edit drafted from the diff) or say why not.
- **Code touched**: `/close` runs `impact --record <key>` — the files and methods the ticket changed, from its
  baseline, kept in its shared file: a later change on those methods finds the ticket at method level, with or
  without a skill.
- `known_issues:` of the current ticket count as declared in its impact; a skill's `tickets:` show as its history.
- `./selftest.sh --real` checks impact and touchpoints on the real Vite project (it found two bugs fixed here:
  capitalised components were not read as methods, and touchpoints skipped a project under a `.cache` folder).

## 0.18.0 — 2026-11-11

- **Workspaces: several service repos, one `.ai`.** A plain folder (no repo) holding service repos is detected as a
  workspace: each service is a stack entry with `"repo"` (its folder) and paths relative to it; the installer detects
  every service's stack and exec, wires the commit guard and the sync hooks into **each** service repo, and the
  doctor shows one hooks / exec row per service.
  - `node .ai/scripts/cli.ts --service <repo> <tool>` runs any tool inside one service (its git, paths and tools).
  - `gate` in a workspace runs the gate of every **changed** service in its own repo, then lists the **contracts**
    the change touched and the services to re-test.
  - **`cli contracts`** — who exposes each HTTP endpoint (Spring mappings, Drupal routes, Express) and who calls it
    (fetch / axios, RestTemplate / WebClient / Feign, Guzzle), paths normalised and matched by their end →
    `.ai/context/contracts.json` + `contracts.md`, rebuilt by setup.
  - Tickets: `services:` (the repos a ticket may touch, with branch and baseline); `/close` hands over one commit per
    service repo plus `.ai`. Review hashes, changed files and the lint after an edit follow the service of the file.
  - Limits: two services of the same stack share one code-index builder; impact / touchpoints (drupal) run per service
    with `--service`.

## 0.17.0 — 2026-11-11

- **`/bootstrap`** — the project's first knowledge from its code: the agent surveys with the indexes and drafts
  `facts.md` (≤ 40 lines, each fact with where it was seen), `intro.md` and the integration notes; what only the team
  knows becomes `[QUESTION]`. Asks once before writing. The installer's Next steps and the doctor propose it while
  the parts are the starter.
- **`install.sh <folder> --all`** — `--update` every project with an ai-core `.ai` under a folder, one table at the
  end. (A per-machine opencode wiring was evaluated and left out: opencode resolves `{file:}` against the config
  file, and each project's agents and tools are composed for its own stack and version.)
- **`./selftest.sh --real`** — the stacks on real public projects, pinned (Vite's react-ts template, spring-petclinic;
  Java only where a JDK exists). It found and this version fixes:
  - react-ts gate: **`tsc` checked nothing** on a solution tsconfig (`"files": []` + `references`, Vite's default) —
    now `tsc -b --noEmit`, so type errors fail the gate;
  - react-ts gate: crashed when no test runner was configured;
  - the installer wrote `"test": "none"` when no runner was found, which `qa` read as the project's decision — now
    the tests are pending and `qa` offers vitest.

## 0.16.0 — 2026-11-11

- **SonarQube at the end of a ticket**: `cli sonar` (and `gate --sonar`) posts the analysis of the branch (Maven:
  sonar-maven-plugin; otherwise `sonar` / `sonar-scanner`), waits for the server to process it, then reads the quality
  gate, the new issues and the new coverage → PASS only with the gate OK and 0 new issues; the failed conditions are
  listed. `/close` runs it when the project is a SonarQube project. `$SONAR_URL` + `$SONAR_TOKEN` in the developer's
  environment (never in the repo); the project key in project.json, sonar-project.properties or pom.xml. `cli qa` and
  the doctor show it as a project check (missing token, scanner or key → the step); `qa --off` turns it off.
- **Machine policy**: `/doctor` finds a machine-wide opencode policy (`C:\ProgramData\opencode`, `/etc/opencode`…),
  says which keys it wins on, and warns when it lets git write (commit, push, reset…) what the project denies.
  The project's own `opencode.json` already denies those for every agent.

## 0.15.0 — 2026-11-11

- **`./selftest.sh`** — ai-core's own checks on this machine instead of a pipeline: every test plus, from WSL, the
  Windows checks (Windows' node runs the doctor on a `\\wsl.localhost` sample, loads the plugins, reaches WSL's node);
  `--install-hook` adds a pre-push hook to the ai-core repo. Nothing for GitHub Actions or any CI service.
- **Context budget**: `cli budget` — what loads on every message (opencode instructions, CLAUDE.md imports, the
  ticket header) against 4000 + 800 tokens; `/doctor` row **context**; a test keeps every stack under it. If you add,
  take something out.
- **`status: waiting-validation`**: when the client must approve the analysis before any code, `/ticket` stops there;
  ▶ Next waits; `/ticket <key> approved | rejected <why>` records the Decision and goes on (or back to the analysis).
- **`[QUESTION]`**: facts only the team knows — the header counts the open ones, `/close` does not close with one;
  answered → `[ANSWERED <date>]`.
- **Regression test red first** in a logic bugfix when the project has tests (the failing assertion is the evidence).
- **`/close` gives the pull request description** (Bitbucket / GitLab) ready to paste, next to the commit messages.

## 0.14.0 — 2026-11-11

- **A ticket's knowledge goes into a skill before `/close`.** When the work is verified and the shared file has no
  `## Knowledge`, ▶ Next proposes `/skill <key>`. It reads the whole ticket folder (`cli knowledge combined <key>`:
  the shared file + every dev's diary), decides CREATE / EDIT / NOTHING, asks once, and on yes writes the skill and
  links both ways — the skill's new `tickets:` front matter, the ticket's `skills:`. It always writes a short
  `## Knowledge` (decision, 2–4 lines, links) and offers to shorten the shared file (what lives in the skill becomes
  `→ skills/<name>`; decisions, evidence, impact, review and closure stay). `/close` skips the curator when
  `## Knowledge` exists. The skill must cite the ticket's changed files / methods: that is what `/impact` and the
  call paths match next time.
- `/skill` runs in the main session (it has to ask and wait for the yes; as a subtask it could not).
- ▶ Next recognises the gate evidence of every stack (eslint, tsc, compile, checkstyle, tests — not only phpcs).
- `cli … | head` no longer prints an EPIPE trace.

## 0.13.1 — 2026-11-11

- **`/jira` shows the drafts in the conversation**, each in its own block ready to copy — it ran as a subtask, so its
  answer came back folded as a tool result. Now the main agent applies the `jira-writer` instructions (the agent stays
  for `@jira-writer`). A new first draft, **Summary** (2–4 lines: what was done and its result); the worklog per dev
  from every diary.
- **More work on a closed ticket**: `/ticket <key> <what>` on a `done` ticket asks whether to reopen it; on yes
  `status: active`, a `Reopened YYYY-MM-DD by <user>` note, the request in Open points, new plan blocks after the last
  letter; the old blocks, Impact, Review and Closure stay as history. `/close` adds a dated Closure entry.

## 0.13.0 — 2026-11-11

- **Code checks for every stack** (`cli qa`, the installer's question, the doctor's row, the gates):
  - react-ts: eslint (the package + a config: `eslint.config.*` / `.eslintrc*`; missing → `npm|pnpm|yarn add -D eslint
    @eslint/js typescript-eslint eslint-plugin-react-hooks` from the lockfile + a base `eslint.config.mjs`), tsc
    (`typescript`), tests (vitest / jest); declared but not in node_modules → `npm|pnpm|yarn install`.
  - java: checkstyle — in the build, or with Maven run by the gate with Google's rules without touching pom.xml
    (`project.json` `"checkstyle": "google_checks.xml"`); with Gradle a step by hand. tests — written by people: a step
    by hand, or off.
  - The installer's *Install them now? [Y/n]* covers them all; *no* turns off only the missing ones. `qa --off` / `--on`
    work per stack (`gateSkip`). Every gate marks an off check SKIPPED and does not run it (`Gate.off()` in gatelib).
  - Java: a build without checkstyle was SKIPPED, now NOT RUN until the project sets it up or turns it off — the same
    rule as the others: a check that does not run is never reported as passed.

## 0.12.0 — 2026-11-11

- **Code checks (Drupal: phpcs + phpstan) detected and set up, or turned off by decision.** `cli qa` says what is
  missing and the exact step for it: the packages are not in composer.json → `composer config allow-plugins… &&
  composer require --dev drupal/coder phpstan/phpstan mglaman/phpstan-drupal phpstan/extension-installer`; required
  but not installed → `composer install`; no config → a base `phpcs.xml` (Drupal + DrupalPractice on the code paths)
  and `phpstan.neon` (level 1). `qa --setup` asks before each step; `qa --off` / `--on` records that the project goes
  without them (`project.json` stacks[].gateSkip → the gate marks them SKIPPED, not NOT RUN).
- Installer: in the Tools step it lists the steps and asks *Install them now? [Y/n]* — yes runs them all; no records
  that the project goes without them (and says how to turn them on later); without a terminal → a Next step with
  the commands. Doctor: row **code checks** (OK · WARN with the step · INFO off by decision) — before, it always said
  "composer install", which does nothing when composer.json never required them. `/doctor` and `/gate` ask the human
  the same question and run `qa --setup --yes` on a yes.
- The gate and the lint after an edit use `phpcs.xml` / `phpcs.xml.dist` / `.phpcs.xml` and `phpstan.neon` /
  `phpstan.neon.dist`, whichever exists.

## 0.11.0 — 2026-11-10

- **Installer: tools step.** From the stacks, where the tools run and the agents it works out what this machine needs
  (git, ddev + docker, php + composer, java + mvn/gradle without a wrapper, npm), shows version or "missing" and offers to
  install each missing one with its command for this system (apt, dnf, brew, winget, or the official ddev / docker / nvm
  scripts) — it asks y/N. `--install-deps` installs without asking, `--no-deps` skips it. `install.sh` / `install.ps1`
  do the same for Node ≥ 22.6 (nvm, no sudo / winget) and git before the installer starts. Later: `cli deps [--install]`.
- **Fix: `/ticket` failed with "Request blocked: prompt injection attempt detected"** on a model gateway with an
  injection guardrail. Its ML detector read "You are in the `actg` root…" (and "how the agent should behave" in
  /learn) as an attempt to change the assistant's role. Both lines reworded.
- **`cli promptcheck`**: sends every command, agent, rule and skill to the gateway opencode uses (the build agent's
  provider; `{env:…}` keys, Windows variables from WSL) and names the exact lines it blocks (bisection, a few calls per
  file); results cached per content in `.ai/promptcheck.local.json` and per machine + gateway in `~/.cache/ai-core`.
  Batches of ≤ 16 KB (the Feniks detector stops looking at ~30 KB): a first check is ~4 calls / ~8 s instead of one
  call per file; a progress bar while it runs. The installer runs it, `/doctor` shows a
  **prompts** row from the cache. Found one more in giportal: a skill line "…overrides all rules".
- **Docs in ai-core** (`docs/`): quick guide and install guide (EN/ES), workflows, agents (EN/ES), the presentation
  (EN) — generic for any project; README points to them.
- Tests: `tests/deps.test.mts` (tools per configuration; promptcheck against a fake gateway).

## 0.10.3 — 2026-11-10

- `cli ocload` loads the opencode plugins and tools the way opencode does (every plugin export called, every tool
  built) and `/doctor` shows it as the row **opencode load** — a broken plugin is caught before opencode says "Failed to
  reload".
- New test `tests/opencode.test.mts`: for drupal, react-ts, java and generic it installs into a sample project and checks
  the load, the `{file:}` references of opencode.json, the single export of each plugin and the Claude Code hooks.
- **Fix: `/doctor` from opencode for Windows said hooks / exclude / skills / ddev FAIL** on a project in WSL (Windows has no
  git or ddev for it). `cli.ts` run by Windows node on a `\\wsl.localhost\…` path re-runs itself inside WSL, so every
  command sees the real environment.
- The tools' `wsl.exe bash -lc` calls load nvm first (a non-interactive shell had no `node`: the hook-signature check
  after an edit did not run from Windows).
- `AI_SKIP_NPM=1` skips the `.opencode` npm install (tests, offline machines).

## 0.10.2 — 2026-11-10

- **Fix: opencode failed to load the project ("Failed to reload", no models).** opencode calls every exported function
  of a plugin file as a plugin; ticket-context.ts also exported `suggest()`, `header()`… and ticket-changes.ts
  `afterEdit()`, which broke the config load. The logic moved to `lib/ticketctx.ts` and `lib/edits.ts`; each plugin file
  now exports only its plugin.
- Setup installs `@opencode-ai/plugin` in `.opencode/` with WSL's npm when it is missing (opencode's own install can fail
  on a `\\wsl.localhost` path: "Maximum call stack size exceeded").

## 0.10.1 — 2026-11-10

- Installer: the "Next steps" of the summary are numbered, each with its purpose; shell commands one per line (`$`, after a `cd` into .ai) and chat commands apart (`›`).

## 0.10.0 — 2026-11-10

Several devs on one ticket, and tickets / known issues in folders:
- `.ai/tickets/<KEY>/<KEY>.md` is the **shared** file (intent, plan, decisions, impact, review, verification);
  `.ai/tickets/<KEY>/<KEY>.<user>.md` is **each dev's diary** (Current state, Changes, Session log) — only its owner
  writes it, so two people on a ticket never edit the same lines. `<user>` = global `git config user.name` as a slug
  (`AI_DEV` overrides). Known issues: `.ai/known-issues/<id>/<id>.md` (+ optional `<id>.<user>.md` notes).
- The edit hook records changes in **your** diary; the header shows your Next (never another dev's) and
  "Also on this ticket: <user> (<when>): <their state>"; `suggest()`, `/review`, `/impact` and the reviewer digest read
  the combined ticket (shared file + every diary). Plan blocks carry their owner (`- [ ] B (<user>)`); `/ticket`
  takes your own or a free block, never someone else's without asking. `/end` writes your diary; `/close` sums the
  diaries in `## Closure`.
- `node .ai/scripts/cli.ts layout [--migrate]`: flat files → folders (`git mv`), links rewritten, INDEX.md rebuilt.
  `node .ai/scripts/cli.ts knowledge whoami | paths <KEY>`. Legacy flat files keep working.
- The edit hook (changes + lint) is in the core now: React / Java / generic projects record changes too.
  `/review` covers every stack's paths (not only lib/ and config/).
- Tests: `tests/team.test.mts` (two devs on one ticket, migration).

## 0.9.0 — 2026-11-10

- **Installer you can read:** five numbered steps (detect · configure · install · wire · check), each question with one
  line on what it is for, detected values as defaults, files counted by folder (`--verbose` lists them), the wiring
  indented, and a **summary** at the end (project, ai-core version and repo, stacks with their paths, exec, language,
  agents, the state of .ai) with the next steps numbered.
- **Starter parts:** a first install (or `--update` when they are missing) writes `.ai/project/parts/intro.md` and
  `facts.md` from what was detected — framework and version, code folders with their modules and themes, config sync,
  languages, npm scripts, exec, a few conventions of the stack — marked STARTER for a human to improve. The STARTER note
  never reaches the composed rules; `/doctor` warns while it is there. Existing parts are never touched.
- **`bash .ai/scripts/setup/upgrade.sh [--yes]`** (`cli.ts upgrade`) from the project: finds ai-core (the lock's source,
  else clones `aiCoreRepo` into `$AI_CORE_HOME` or `~/devel/ai-core`), `git pull --ff-only` (stops if that clone has local
  changes), shows the CHANGELOG entries since the installed version and the files a dry run would write, asks, updates
  and re-wires, and proposes the commit of .ai. `project.json` gets `"aiCoreRepo"` from ai-core's origin.
- **`/doctor` knows when ai-core has a newer version** (fetch + VERSION on the upstream) → `upgrade.sh`.
- A new `.ai` repository starts on branch `main`.

## 0.8.0 — 2026-11-10

- **`java` stack** (phase 5): Maven or Gradle (wrapper first; `"build"` in project.json to force one), local or docker.
  Gate = compile main + test (javac errors as Maven / Gradle print them) + Checkstyle (XML, when the build declares it) +
  JUnit XML (surefire / Gradle test-results), NEW vs PRE-EXISTING; a failing test always fails. The module folder is the
  nearest pom.xml / build.gradle above the paths (multi-module) or `"root"`. Spring code index: classes, methods with
  callers, beans, `@*Mapping` routes (class prefix + method), Kafka / Rabbit / JMS listeners, `@EventListener`,
  `@Scheduled`. Reviewer / gate parts for Java. Detected by pom.xml + src/main/java or build.gradle.
- Tested with a Spring fixture and a fake `mvn` (tests/stacks.test.mts). Not yet run on a real microservice nor on
  Windows with a real JDK — that is the pilot of the plan.

## 0.7.0 — 2026-11-10

Architecture and integrations, generated and watched (phase 4b, Drupal stack):
- `node .ai/scripts/cli.ts integrations --update` (`bash .ai/scripts/analysis/scan-integrations.sh`) writes
  `context/integrations.md`: inbound REST resources (annotation + rest.resource config: paths, formats, auth), outbound
  HTTP clients (calls and the config they read), OpenID Connect clients, mail policies and transports, hook_mail,
  hook_cron, QueueWorkers and ultimate_cron jobs — each with file:line and config, a mermaid diagram module ↔
  integration, and a `notes` block per integration (why · how it fails · how to test) that regeneration keeps.
- One card per module in `context/modules/<module>.md` (services, routes, hooks, events, integrations + a kept
  purpose note), from the code index.
- Drift: without `--update` it compares with the snapshot `context/integrations.json` (ADDED / CHANGED config /
  REMOVED) — part of `/scan` and of `/doctor`'s index check. `where <text> --kind integration` searches it.
- On GI Portal: 5 REST resources, the web-services HTTP client, the OpenID client, 7 mail policies + 2 transports,
  4 queue workers, 15 cron jobs; 26 module cards.

## 0.6.0 — 2026-11-10

Stacks beyond Drupal (phase 4):
- **`react-ts`**: gate = eslint (JSON) + `tsc --noEmit` + vitest/jest (JSON) with NEW vs PRE-EXISTING (a failing test
  always fails); tools run as `node <pkg>/bin/<x>.js` from the package's node_modules (no npx: same on Windows), or
  through docker; the package folder is the nearest package.json above the paths (monorepos) or `"root"`. Code index of
  components, functions, custom hooks, class methods, calls / JSX usage, react-router routes and i18n strings — `where`
  and `callers` work as in Drupal. Rules and agents get React parts (reviewer checklist, architect, developer, gate).
- **`generic`**: any project — the gate runs the commands in project.json (`"gate": [{ name, run, parser }]`; parser
  `file-line` → NEW vs PRE-EXISTING, `exit` → exit code). Installer default when no stack is detected.
- **Several stacks in one project**: core `gate.ts` / `codeindex.ts` dispatch to `gate-<stack>.ts` /
  `codeindex-<stack>.ts` (each on its own paths; one section per stack + a combined RESULT); `opencode.json` is the
  core one deep-merged with each stack's `opencode.<stack>.json` (bash rules ordered * → allow → ask → deny).
  One stack → exactly the previous output (giportal's golden files unchanged).
- Core `gatelib.ts` (changed files, touched lines, NEW/PRE, one output format) and default parts for agents of stacks
  that bring none. `where` / `callers` argument parsing fixed.
- ai-core's own tests: `node --experimental-strip-types --test tests/stacks.test.mts` (react-ts with fake tools, generic).
- Not yet for react-ts / generic: `impact`, `touchpoints`, `callpaths`, `references` (they are Drupal's) — next.

## 0.5.0 — 2026-11-10

Claude Code as a second target (phase 3b, option A: tools through the CLI). With `"agents": ["opencode", "claude-code"]`
in project.json (installer question / `--agents`), setup also writes:
- `CLAUDE.md` → `@.ai/core-rules.md`, `@.ai/orchestrator.md`, `@.ai/claude-code.md` (new: how the opencode tools and
  commands map in Claude Code);
- `.claude/settings.json` — hooks `UserPromptSubmit` (ticket header + suggested command, every message), `SessionStart`
  compact|resume (the ticket state the summary must keep), `PostToolUse` Edit|Write|MultiEdit (## Changes + the stack's
  lint) — all `node .ai/scripts/cli.ts hook …`, the same functions as the opencode plugins; permissions translated from
  opencode.json (a leading `*` — "contains" — also covers `ddev …`), plus .env / keys denied. The human's own entries
  are kept;
- `.claude/agents/` (11) and `.claude/commands/` (17) from the same sources (commands `@`-include `.ai/commands/x.md`;
  subtask commands name their subagent); `.claude/skills` → link to `.ai/skills`.
- New CLI commands: `where`, `callers`, `hook prompt|session|edit`. `/doctor` checks the Claude Code wiring;
  `setup --uninstall` removes it. The edit lint follows the project's exec (no more hard-coded `ddev exec`).
- Verified: generated files, the three hooks with Claude Code's JSON on stdin (header, compaction state, edit recorded
  in ## Changes + lint). Not verified inside a live Claude Code session (none available on the test machines).

## 0.4.0 — 2026-11-10

Team hooks (phase 3a) — what a dev gets without doing anything:
- **After a pull / merge / rebase / branch switch** (post-merge, post-rewrite, post-checkout in both repos):
  `known-issues/INDEX.md` and the stack's indexes are regenerated in the background (`node .ai/scripts/cli.ts sync`,
  log in `.ai/context/.sync.log`), so `where` / `callers` / `impact` answer from the code you now have.
- **Generated files never stop a merge:** `.ai/.gitattributes` (now managed by ai-core) marks `known-issues/INDEX.md`
  and `context/callgraph.json` `merge=ours`; setup sets the driver; post-merge regenerates INDEX.md from the merged
  known issues (commit it). `context/api-index.json` is no longer tracked (it depends on each machine's install).
- **`/ticket` checks the team's knowledge first:** `bash .ai/scripts/setup/ai-status.sh` (`sync --remote`: fetch +
  counts) → `BEHIND n` → it proposes `git -C .ai pull` before starting.
- Tested with two devs sharing remotes: a function pushed by A is in B's code index right after B's pull; two known
  issues created at the same time merge (and rebase) without a conflict and INDEX.md lists both.

## 0.3.0 — 2026-11-10

- **Installer in TypeScript** (phase 3): `install.sh` / `install.ps1` → `install.ts`; `install.py` is gone. Detects the
  stack (drupal: composer.json, the core folder — `web/`, `docroot/` or `web/<x>/` — and the code paths) and the exec
  (ddev / docker / local), asks with those as defaults (`--yes` for none), writes an empty knowledge skeleton and
  `git init`s a new `.ai`. New: `--reconfigure`, `--uninstall`, `--adopt` on an existing install, `--help`.
- **Wiring in TypeScript** (`node .ai/scripts/cli.ts setup | hooks`): the same on Windows without bash. Hooks are
  `#!/bin/sh` (git for Windows runs them with its own shell); pass-throughs only for the usual hooks and the ones the
  project has (no `reference-transaction` on every ref update). Indexes from `scripts/setup/stack.<name>.json`; a
  command that rewrites knowledge (callpaths) runs only when its output is missing.
- **`/doctor`** (`node .ai/scripts/cli.ts doctor`): Node, project.json, managed files and ai-core updates, hooks
  installed *and able to run* (catches an incomplete Git for Windows), exclude, opencode.json + `{file:}` references +
  stubs, indexes fresh, exec environment and the stack's tools, `.ai` vs its remote. One fix per problem.
- The drupal stack follows `project.json` paths everywhere (code index, call paths, impact, touchpoints, references):
  a standard Drupal (`web/modules/custom`) works, not only GI Portal's `lib/`.
- Tested: clean install of a demo Drupal in WSL (non-interactive and interactive) and natively on Windows
  (install.ps1 + node.exe + Git for Windows); giportal updated with the same golden outputs.

## 0.2.0 — 2026-11-10

- **Runtime in TypeScript** (phase 2): `node .ai/scripts/cli.ts <command>` — gate, apiindex, impact, callpaths,
  codeindex, references, touchpoints, review, knownissues, md2html. Node ≥ 22.6, no npm dependency, no Python, no
  awk. The `.sh` wrappers stay (same commands, same flags) and only call the CLI.
- Same output as the Python version: 17 golden cases byte-identical, plus the real project (code-index.json,
  callgraph.json, skills after `callpaths --update`, api-index.json, INDEX.md, every doc through md2html, the impact
  backtest). One deliberate change: touchpoints walks folders in sorted order (Python used the file system's order,
  which differs between ext4 and NTFS); the review digest names its wrapper instead of the .py file.
- Windows native (node.exe): same output as Linux for impact, callpaths, codeindex, apiindex, touchpoints, knownissues.
  Fixed on the way: path filters received `\` separators on Windows.
- `install.py` is still Python: it becomes `install.ps1` / `install.sh` → `node … install` in phase 3.

## 0.1.1 — 2026-11-10

- `install.py --promote [--add PATH --layer core|stacks/<s>]`: the way back — managed files edited in a project's
  `.ai` go into ai-core, keeping `{{var}}` on untouched lines and flagging project-specific text.

## 0.1.0 — 2026-11-10

First version, extracted from the GI Portal knowledge repo (`feature/ticket-memory` + phases 0–0d of the plan).

- **Layers:** `core/` (workflow: 16 commands, 7 agents, templates, opencode tools and plugins, git hooks, review
  rounds), `stacks/drupal/` (gate with NEW/PRE-EXISTING split, API signatures, smoke, code index, impact, callpaths,
  touchpoints, references, content-model drift, opencode.json, wiring), `core/compose/` (core rules, orchestrator and
  4 agents composed from parts: stack parts + `<project>/.ai/project/parts/`).
- **`install.py`:** first install, `--adopt` (migrate an existing `.ai`), `--update` with a lock of hashes (hand-edited
  files are never overwritten: `<file>.ai-core-new`), `--status`, `--dry-run`.
- **`project.json`:** name, repo, language, agents, stacks (`paths`, `configSync`, `apiRoot`, `exec`: ddev · docker ·
  local), `vars` (e.g. `drush: "ddev drush"`). The Drupal gate and the API index read it.
- **Git hooks in path mode** (`core.hooksPath` → `.git/ai-core-hooks`): the project's tooling keeps owning
  `.git/hooks` (the EC toolkit rewrites it on composer install) and both run; chain mode when the project has its own
  `core.hooksPath` (Husky).

Known limits (next phases of the plan): runtime still Python + bash (phase 2: TypeScript, Windows native); some core
texts still speak Drupal (`debugger`, `/scan`, `ticket-changes` lint on edit) until the generic adapter (phase 4);
golden tests live in the first project (they need its snapshot) — stack fixtures in ai-core come with phase 2.
