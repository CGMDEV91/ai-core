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

Change the workflow **here**, then `install.py <project> --update` in each project. A managed file edited inside a
project is kept and the new version lands next to it as `*.ai-core-new` (`--status` lists them).

## Compose: `{{var}}` and `{{#part X}}`

- `{{name}}`, `{{repo}}`, `{{aiCore}}` + the stack's `vars` (`adapter.json`) + `project.json` `vars` (wins).
  Replaced in composed files and in every `.md` / `.json` of the layers.
- `{{#part X}}` on its own line → `stacks/<s>/parts/X.md` then `<project>/.ai/project/parts/X.md` (a project part
  starting with `<!-- replace -->` replaces the stack's); neither → `core/parts/X.md`; none → the line vanishes.

Plan, phases and decisions: the first project's `docs/plan-ai-core.es.md` (GI Portal).
