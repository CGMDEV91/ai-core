---
name: 01-change-the-framework
description: How to change anything in framework/ (commands, procedures, rules, templates, tools) safely — the loop, the compatibility rules for projects already installed, the tests, and how the change reaches the projects. Read before any change to framework/.
---

# SKILL-01 — Change the framework

## Purpose
Every change to `framework/` reaches real projects with an update. This is the loop that keeps them working.

## Rules in force
- **The source is `framework/` here.** Never fix a project's `.ai/scripts` or `.ai/commands` in place: the next
  `update-ai-framework` overwrites it. Fix here, commit, update the project.
- **A computed fact beats a written instruction.** If the model keeps getting something wrong, first ask whether a
  tool can compute it (receipts, `ticket new`, `orchestrator --write` came from this question).
- **Installed projects keep working.** Read old names and old layouts as well as new ones: `guidelines.local.json`
  (the old record), old wording of generated markers (`CP_RE` / `RS_RE` match any wording), flat tickets
  (`layout --migrate`), the old shell block of the terminal commands. Never rename a generated marker without a
  regex that accepts the old one.
- **Generated vs hand-written.** A tool rewrites only its blocks; everything else is the team's. Keep it so.
- **Always-loaded text costs on every message** (`context/measurements.md`). Anything that is not needed on every
  message goes to a procedure read on demand. Check `budget` after touching `non-negotiables.md`, `rules/` or the
  orchestrator templates.
- **Text passes the gateway**: run `promptcheck` after changing any command, procedure, rule or template (skill 08).
- **The two installers change together** (skill 02). **The two agents** (opencode, Claude Code) get the same
  commands and agents from `framework/install/opencode/` (skill 03).
- A tool's message names the command that fixes it as `node .ai/scripts/ai.mjs <tool> …` — never a script that does
  not exist (`scan-*.sh` wrappers were removed in 1.0).

## How to
1. Edit `framework/…`. A new tool: `framework/scripts/lib/<name>.ts` exporting `main(argv)`; a library without
   `main` goes into `NOT_COMMANDS` in `cli.ts`. Add it to `framework/scripts/README.md`.
2. Tests: `node --experimental-strip-types --test tests/*.test.mts` (each test installs into a temp repo with
   `install.sh`, ~4 min); a new behaviour gets a test. Full check from WSL: `./selftest.sh` (Windows checks too).
3. `promptcheck` in a project installed from the working tree when prompts changed.
4. `CHANGELOG.md` entry, `framework/install/VERSION` when it is a release, README / guides when users see it (skill 09).
5. The knowledge here: update the skill or context file the change belongs to, with a `## History` line.
6. Commit (short message, no co-author line); the owner pushes. Then `update-ai-framework` in each project — it
   refuses uncommitted changes in ai-core unless `--force`.

## Key files
- `framework/scripts/cli.ts` — `NOT_COMMANDS`, the dispatch to `lib/<tool>.ts`
- `framework/scripts/lib/project.ts` — `AI`, `WORKSPACE`, `ROOT`, `cfg()`
- `framework/scripts/lib/callpaths.ts` — `CP_RE`, the marker that accepts old wordings
- `tests/helpers.mts` — `install()`, `cli()`, `commitAll()`
- `selftest.ts`

## History
- 2026-11-16 — written from the 1.0.0 merge (Edu 3.3 branch → ai-core).
