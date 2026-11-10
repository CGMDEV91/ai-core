# Changelog

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
