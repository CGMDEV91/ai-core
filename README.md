# ai-core

A fixed, tool-agnostic workflow for AI coding agents (opencode today; Claude Code next), installed into each
project's knowledge folder (`<project>/.ai`, its own git repo) and adapted per stack.

```
core/            the workflow — commands, agents, templates, tools, plugins, git hooks (any stack)
core/compose/    files composed from parts: core rules, orchestrator, architect / developer / reviewer / gate agents
core/parts/      default parts (used only when neither the stack nor the project has one)
stacks/<name>/   what a stack adds — gate, indexes, lint, opencode.json, wiring; adapter.json = its vars and defaults
stacks/<name>/parts/   the stack's parts for core/compose
core/scripts/cli.ts    the runtime: node .ai/scripts/cli.ts <command> — TypeScript, Node ≥ 22.6, no dependencies; Linux, WSL, Windows
install.sh · install.ps1 → install.ts   install · --update · --reconfigure · --status · --promote · --adopt · --uninstall
```

## Install into a project

Requirements: **Node ≥ 22.6** (runs the TypeScript as is, no npm install) and **git** — on Windows the full Git for
Windows (git runs the hooks with its `usr\bin\sh.exe`; `/doctor` says so when it is missing).

```bash
~/devel/ai-core/install.sh <project>                 # Linux · WSL · macOS
```
```powershell
& C:\dev\ai-core\install.ps1 <project>              # Windows (clone ai-core on a local disk: execution policies block .ps1 on network paths)
```

1. **Detects** the stack (composer.json with drupal/core → `drupal`, with the core folder and the code paths; pom.xml →
   java; package.json + tsconfig → react-ts) and the exec (`.ddev/` → ddev, a compose file → docker, else local).
2. **Asks** — stacks, name, exec, language, agents — with the detected values as defaults (`--yes` takes them all;
   `--stack/--name/--exec/--lang/--agents` answer one).
3. **Writes** `<project>/.ai/`: the managed files, `project.json`, `ai-core.lock.json`, an empty knowledge skeleton
   (skills, known-issues, tickets, context, project/parts) and `git init` if `.ai` is new.
4. **Wires** the checkout (`node .ai/scripts/cli.ts setup`): git hooks in `.git/ai-core-hooks` (the project's own keep
   running), `.git/info/exclude`, `opencode.json` + stubs, the stack's indexes.
5. **Checks** with the doctor (`/doctor`, `bash .ai/scripts/setup/doctor.sh`, `node .ai/scripts/cli.ts doctor`).

Later: `--update` (newer ai-core) · `--reconfigure` (ask again) · `--status` · `--uninstall` (removes the wiring;
the knowledge stays) · `--adopt` (take ai-core's version of every managed file, even edited ones) · `--help`.
Then write the project's own parts in `<project>/.ai/project/parts/` (at least `intro.md` and `facts.md`) and `--update`.

## What belongs to whom

| ai-core (managed, overwritten by `--update` unless edited by hand) | the project (never touched) |
|---|---|
| every file listed in `.ai/ai-core.lock.json` | `skills/`, `known-issues/`, `tickets/`, `context/`, `docs/`, `project/`, `project.json`, tests with its own snapshot |

## Changing the workflow: work in a project, promote, update the others

You do not edit ai-core by hand. Change commands, agents or scripts in the `.ai` of the project where you test them,
commit there as usual, then:

```bash
~/devel/ai-core/install.sh <project> --promote --dry-run      # what would go back
~/devel/ai-core/install.sh <project> --promote [--add agents/new.md --layer core]
git -C ~/devel/ai-core diff && git -C ~/devel/ai-core commit -am "…"     # review: ⚠ lines still look project-specific
~/devel/ai-core/install.sh <other-project> --update          # every other project
```

- Untouched lines keep ai-core's `{{var}}`; changed lines get the project's name / repo / vars turned back into
  `{{var}}`; a line that still names the project or a ticket key is flagged (`promoteWarn` in project.json adds words).
- New files: `--add <path> --layer core` (any stack) or `--layer stacks/<name>`. A new agent or command also needs its
  entry in the stack's `scripts/setup/opencode.json` — edit it in the project and promote it too.
- Composed files (`core-rules.md`, `orchestrator.md`, 4 agents) are never promoted: a project change goes in
  `.ai/project/parts/`; a change for everyone in `core/compose/` or `stacks/<s>/parts/`.
- A managed file edited in a project and not promoted is kept by `--update` (the new version lands as
  `*.ai-core-new`; `--status` lists them).

## Compose: `{{var}}` and `{{#part X}}`

- `{{name}}`, `{{repo}}`, `{{aiCore}}` + the stack's `vars` (`adapter.json`) + `project.json` `vars` (wins).
  Replaced in composed files and in every `.md` / `.json` of the layers.
- `{{#part X}}` on its own line → `stacks/<s>/parts/X.md` then `<project>/.ai/project/parts/X.md` (a project part
  starting with `<!-- replace -->` replaces the stack's); neither → `core/parts/X.md`; none → the line vanishes.

Plan, phases and decisions: the first project's `docs/plan-ai-core.es.md` (GI Portal).
