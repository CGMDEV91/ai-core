# Changelog

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
