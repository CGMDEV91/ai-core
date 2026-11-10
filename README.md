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

## Stacks

| stack | detected by | gate | index for `where` / `callers` |
|---|---|---|---|
| `drupal` | composer.json with drupal/core | phpcs · phpstan (JSON) · hook signatures · drush cr · smoke · config:status | methods, services, routes, events, hooks, fields, UI strings |
| `react-ts` | package.json with react + tsconfig.json | eslint (JSON) · tsc · vitest / jest | components, functions, hooks, routes, i18n strings |
| `java` | pom.xml + src/main/java, build.gradle | compile · Checkstyle (XML) · JUnit XML (Maven / Gradle) | classes, methods, beans, routes, listeners, @Scheduled |
| `generic` | anything else | the commands in project.json `"gate"` (`file-line` or `exit`) | — |

Several stacks in one repo (Drupal + a React front end): each stack has its `paths`; the gate and the index run each
stack on its own files. Tests of the adapters: `node --experimental-strip-types --test tests/stacks.test.mts`.

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

## Agents: opencode and Claude Code

`project.json` → `"agents": ["opencode"]`, `["claude-code"]` or both (installer question, `--agents`). Both read the
same `.ai/` — rules, skills, tickets, known issues — so a ticket started in one continues in the other.

| | opencode | Claude Code |
|---|---|---|
| rules | `opencode.json` → `instructions` | `CLAUDE.md` → `@.ai/core-rules.md` `@.ai/orchestrator.md` `@.ai/claude-code.md` |
| tools `where` · `callers` · `touchpoints` · `impact` · `gate` | opencode tools (`.opencode/tool`) | `node .ai/scripts/cli.ts …` (allowed in settings) |
| ticket header every message · state after compaction · edit tracking + lint | plugins | hooks `UserPromptSubmit` · `SessionStart` · `PostToolUse` → `cli.ts hook …` |
| agents · commands · skills | `opencode.json` | `.claude/agents`, `.claude/commands`, `.claude/skills` (generated) |

## A team on the same project

A new dev clones the project and its `.ai`, runs `bash .ai/scripts/setup/install.sh` once (or `node … cli.ts setup`),
and follows the flow. Without doing anything else:
- **pull / merge / rebase / branch switch** → the indexes are rebuilt in the background (hooks → `cli.ts sync`);
- **generated files** (`INDEX.md`, `callgraph.json`) never stop a merge (`merge=ours` + regenerated after it);
- **`/ticket`** says when `.ai` is behind its remote and proposes the pull; **`git push`** of the project warns when
  `.ai` has work not pushed; **`/close`** proposes the two commits and reminds to push both.

## Several devs on one ticket

`.ai/tickets/<KEY>/<KEY>.md` is shared; each dev has a diary `<KEY>.<user>.md` (user = global git user.name) with their
Current state, Changes and Session log — nobody writes another's diary, so pushes do not collide. The header of every
message shows who else is on the ticket and what they hold; plan blocks carry an owner. Migrate old flat files with
`node .ai/scripts/cli.ts layout --migrate`.

## What belongs to whom

| ai-core (managed, overwritten by `--update` unless edited by hand) | the project (never touched) |
|---|---|
| every file listed in `.ai/ai-core.lock.json` | `skills/`, `known-issues/`, `tickets/`, `context/`, `docs/`, `project/`, `project.json`, tests with its own snapshot |

## Updating a project to the latest ai-core

From the project (anybody, any machine): `bash .ai/scripts/setup/upgrade.sh` — it finds or clones ai-core
(`aiCoreRepo` in project.json), pulls it, shows what changed since the installed version and which files would be
written, asks, updates and re-wires; then commit and push `.ai` so the team gets it. `/doctor` tells when there is a
newer version.

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
