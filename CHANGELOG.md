# Changelog

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
