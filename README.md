# ai-core

A fixed, tool-agnostic workflow for AI coding agents (opencode today; Claude Code next), installed into each
project's knowledge folder (`<project>/.ai`, its own git repo) and adapted per stack.

```
core/            the workflow — commands, agents, templates, tools, plugins, git hooks (any stack)
core/compose/    files composed from parts: core rules, orchestrator, architect / developer / reviewer / gate agents
core/parts/      default parts (used only when neither the stack nor the project has one)
stacks/<name>/   what a stack adds — gate, indexes, lint, opencode.json, wiring; adapter.json = its vars and defaults
stacks/<name>/parts/   the stack's parts for core/compose
install.py       install · --adopt · --update · --status (standard-library Python for now)
```

## Install into a project

```bash
python3 -I ~/devel/ai-core/install.py <project> --stack drupal --name "My Portal"
```

It writes `<project>/.ai/` (managed files + `project.json` + `ai-core.lock.json`) and runs the stack's wiring
(`scripts/setup/install.sh`: git hooks, `.git/info/exclude`, `opencode.json`, opencode stubs, indexes).
Then write the project's own parts in `<project>/.ai/project/parts/` (at least `intro.md` and `facts.md`) and re-run.

## What belongs to whom

| ai-core (managed, overwritten by `--update` unless edited by hand) | the project (never touched) |
|---|---|
| every file listed in `.ai/ai-core.lock.json` | `skills/`, `known-issues/`, `tickets/`, `context/`, `docs/`, `project/`, `project.json`, tests with its own snapshot |

## Changing the workflow: work in a project, promote, update the others

You do not edit ai-core by hand. Change commands, agents or scripts in the `.ai` of the project where you test them,
commit there as usual, then:

```bash
python3 -I ~/devel/ai-core/install.py <project> --promote --dry-run      # what would go back
python3 -I ~/devel/ai-core/install.py <project> --promote [--add agents/new.md --layer core]
git -C ~/devel/ai-core diff && git -C ~/devel/ai-core commit -am "…"     # review: ⚠ lines still look project-specific
python3 -I ~/devel/ai-core/install.py <other-project> --update          # every other project
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
