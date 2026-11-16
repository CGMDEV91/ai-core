# ai-core

An AI coding framework for **opencode** and **Claude Code**: a working method (commands, procedures, subagents,
rules) and the deterministic tools that back it (gate, impact, touchpoints, code index, ticket header…). It is
installed into each project as `.ai/`, the project's knowledge repository, and works on Drupal, Java,
React + TypeScript and anything else, in one repository or in a workspace of several services.

```
framework/        what is copied into <project>/.ai — the method and the tools
  commands/         the procedures of the slash commands (/start, /analysis, /bugfix, /adaptive, /reviewer …)
  procedures/       the shared steps the commands call: intake, gate, review, close, session start and end, skills
  rules/            always-loaded rules (+ rules/stacks/<stack>.md, read with the service)
  policies/ templates/ routing.md non-negotiables.md METHODOLOGY.md HOW_TO.md claude-code.md
  install/          the per-machine wiring: opencode commands, subagents and the ticket plugin (Claude Code's are generated from them)
  scripts/          the tools: node .ai/scripts/ai.mjs <tool> — TypeScript, Node ≥ 22.6, no npm install
install.sh · install.ps1   set up, update or reconfigure a project (Linux / WSL / macOS · Windows)
bin/               install-ai-framework · update-ai-framework (terminal commands) · install-commands.sh
docs/              quick guides (English, Spanish)
tests/             the tests of the tools and of the installer · selftest.sh
```

## Install

Requirements: **git** and **Node ≥ 22.6** (the tools run the TypeScript as it is), and opencode or Claude Code.

**Once per machine**, the two terminal commands (WSL / Linux / macOS; from WSL also your PowerShell profile, where
they run inside WSL):

```bash
bash ~/devel/ai-core/bin/install-commands.sh
```

Open a new terminal. Then, **once per project**, in its folder:

```bash
install-ai-framework
```

- **One repository** (a Drupal site, a monorepo): run it at the root. `.ai/` goes inside it, as its own git
  repository, ignored by the project (`.git/info/exclude`; the project's `.gitignore` is not changed).
- **A workspace**: a plain folder that holds the service repositories side by side. `.ai/` goes beside them.
- Already installed: it says so and does nothing (`update-ai-framework` updates it).

It asks, with the detected value as the default (Enter keeps it): the **stacks**, the **agent** (opencode,
claude-code or both), **where the tools run** (ddev, docker compose, local) and whether to **set up the code checks**
the gate runs (phpcs / phpstan, eslint / tsc, Checkstyle). Then it copies the framework into `.ai/`, installs the
commit guard, wires the agent for this machine, writes `.ai/project.json` and builds the indexes.

| Option | What |
|---|---|
| `--agent opencode\|claude-code\|both` | the agent(s); recorded in `.ai/project.json`, so an update wires the same ones |
| `--remote <url>` | clone the team's existing knowledge repository as `.ai/` (joining a project) |
| `--stack drupal\|java\|react-ts\|generic` | the stacks, when nothing is cloned yet or detection is wrong |
| `--service-hooks` | the commit guard also in each service repository (it blocks secrets and AI files there) |
| `--with-permissions` | the permission baseline in your user config: git writes denied, the tools allowed |
| `--yes` | no questions: the detected values |

Without the terminal commands: `bash ~/devel/ai-core/install.sh --project <folder> [--in-repo]` (Windows:
`install.ps1 -Project <folder> [-InRepo] [-Agent …]`, from a copy of ai-core on a local disk: execution policies
block a `.ps1` on a network path). `bash install.sh --help` lists every option.

## Startup: the first session

1. **Open the agent in the project folder** — never inside a service folder of a workspace. opencode: open the
   folder (restart the app if it was open: it reads its configuration at start). Claude Code: `cd <project> && claude`.
2. **`/doctor`** — the set-up in one table, one fix per problem: Node, `project.json`, the agent's wiring, the commit
   guard, the indexes, each service's exec environment and code checks, what loads on every message.
3. **`/start`**, once per project — it reads the code (one subagent per service) and writes the knowledge base:
   `.ai/orchestrator.md` (the system: services, gates, conventions), `.ai/services/<name>/service.md` and its context
   areas, `.ai/integrations.md` (who calls whom), `.ai/CONTEXT.md` and the skills index. In a project with Drupal
   services the orchestrator is built by a tool from the code (`ai.mjs orchestrator --write`) and the model writes only
   the team's parts. Facts it could not verify are marked `[ASSUMED]`; review them, then commit the knowledge:
   `git -C .ai add . && git -C .ai commit -m "[project] knowledge base"`.
4. **The first ticket** — see below. From then on every session starts with a ticket command.

Joining a project somebody already set up: `install-ai-framework --remote <url of its knowledge repository>`, then
`/doctor`; `/start` is not needed (the knowledge base exists: `git -C .ai pull` keeps it current).

## Working on a ticket

| Kind of work | Commands |
|---|---|
| a bug | `/analysis <KEY>` (prior art, evidence, root cause, the analysis for Jira) → `/bugfix <KEY>` (plan, regression test red then green, the fix, the gate, review, test instructions, close) |
| an evolution or a new feature | `/adaptive <KEY>` — intake, impact analysis, client validation when needed, a plan in phases per service, the gate at each phase, review, test instructions, close |

- **Every ticket is a folder** `.ai/tickets/<KEY>/`: the shared `<KEY>.md` (intent, analysis, impact, changes,
  verification, review, knowledge, closure) and **one diary per developer** `<KEY>.<you>.md` (current state, changes,
  session log). Two people can work on one ticket without conflicts.
- **A header on every message** says which ticket you are on and the step its state calls for; every command ends
  with a `▶ Next` line. The agent stops wherever only you can decide (a business rule, a validation, the commit).
- **The gate** runs each changed service's checks in its own repository and exec: NEW findings block, PRE-EXISTING
  ones never. Its result is written by the tool (the receipt), not by the model.
- **At the close** what the ticket taught goes to the skills (the business rules in force) or a known issue, the
  methods it changed are recorded, and the Jira texts and commit messages are drafted.
- **The agent never commits, pushes or switches branches.** You commit the code in its repository and the knowledge in
  `.ai/`.
- To stop for the day without closing: say "end the session" — your diary keeps the current state and the next step.

## Commands

| Command | What it does |
|---|---|
| `/start` · `/start <service>` | write the knowledge base from the code (the whole system, or one service added later) |
| `/restart` · `/restart <service>` | update it after the code changed (a new module, a stack upgrade, a service added); hand-written rules are kept |
| `/analysis <KEY>` | a bug up to its analysis: prior art, evidence, root cause, the Jira analysis comment |
| `/bugfix <KEY>` | the fix of an analysed bug, end to end |
| `/adaptive <KEY>` | an evolution or a new feature, end to end |
| `/impact [<KEY>]` | what else a change can break: the business flows (skills), past known issues and tickets on the same methods |
| `/touchpoints <term>` | every place a status, field, role, route or message lives, in every service, grouped by kind of place |
| `/gate` | run the gate now and fix the NEW findings |
| `/reviewer [<KEY>]` | fresh-eyes code review of the ticket's diff (the `reviewer` subagent) |
| `/security [<KEY>]` | security pass of the diff: injection, access control, secrets, dependencies (the `security` subagent) |
| `/architect [<KEY>]` | design critique and a phase plan before implementing (the `architect` subagent) |
| `/tester [<KEY>]` | write the missing tests of a change and run its gate (the `tester` subagent) |
| `/learning` | capture a gotcha, a decision or a business rule where it belongs |
| `/doctor` | is the set-up healthy — one table, one fix per problem |
| `/update-ai-framework [--check] [--agent …]` | pull and apply a newer ai-core, or change the agent(s) |

In a terminal: `install-ai-framework` and `update-ai-framework` (in the project folder).

## Subagents

The commands delegate to subagents with an **empty context**: they get a closed scope (a diff, a task, a design) and
return a short fixed report, so the main session keeps its context for the ticket. The main session orchestrates:
it plans, reviews every diff and owns the ticket file.

| Subagent | Role | Can edit |
|---|---|---|
| `executor` | implements one closed task and reports the gate result; also bulk work in batches and exploring one service for `/start` | yes |
| `reviewer` | reviews only the diff against the checklist; findings with evidence, in the ticket's `## Review` | no |
| `security` | security audit of the diff | no |
| `architect` | critiques a design, writes the phase plan with the delivery order | plan files only |
| `tester` | writes the missing tests in the service the change belongs to, runs its gate | yes |

How to use them:

- **Through the commands** (the normal way): `/reviewer`, `/security`, `/architect`, `/tester` run their subagent;
  `/start`, `/adaptive` and `/bugfix` delegate to `executor` on their own when a task is closed and mechanical.
- **By hand in opencode**: mention it in your message — `@executor rename X to Y in module Z`, `@reviewer` — or switch
  the main session to `architect` (it can also be a primary agent).
- **By hand in Claude Code**: ask for it by name ("use the reviewer subagent on this diff") or `/agents` to see them;
  the main session runs it with the Task tool.

The model of each role is configured in your agent (`routing.md` → Active setup): by default the same model plays
every role, and what changes is the context it gets.

## The agent: opencode or Claude Code

Both read the same `.ai/` (rules, commands, tickets, skills, tools), so a ticket started in one continues in the
other. Choose with `install-ai-framework --agent …` (asked the first time).

| | opencode | Claude Code |
|---|---|---|
| always-loaded rules | `instructions` in your user opencode config | `CLAUDE.md` in the project folder: only `@.ai/…` imports, excluded from git; one that is not ours is left alone |
| commands · subagents | your user opencode config | `~/.claude/commands`, `~/.claude/agents`, generated from the same files |
| ticket header · state after a compaction · edits recorded in your diary | the ticket plugin | hooks in `~/.claude/settings.json` → `node .ai/scripts/ai.mjs hook …` |
| opencode on Windows with the project in WSL | git and drush rewritten to run in WSL | — (Claude Code runs in WSL) |
| set it up / remove it | `.ai/install/install-opencode.sh [--uninstall]` | `node .ai/scripts/ai.mjs claude install` · `claude uninstall` |

**Change it later**: `update-ai-framework --agent opencode|claude-code|both`, or `update-ai-framework --reconfigure`
to be asked again (from the agent: `/update-ai-framework --agent …`). It applies at once, even without a new version.
A project that stops using Claude Code loses its `CLAUDE.md`; the per-machine wiring stays for other projects.

## Tools

Run from the project folder: `node .ai/scripts/ai.mjs <tool>`. The commands call them; you can too.

| Tool | What it answers |
|---|---|
| `gate [--sonar]` | each changed service's checks, NEW vs PRE-EXISTING, `RESULT: PASS / FAIL / INCOMPLETE` |
| `impact` · `touchpoints <term>` · `where <name>` · `callers <Class::method>` | what a change can break · where a value lives · locate code · who calls a method |
| `ticket new <KEY> --type … --title …` | the ticket folder, its shared file and your diary, from the templates |
| `receipts` · `receipts fold <KEY>` | the result lines the tools wrote for the ticket · folded into it at close |
| `next` | the step the flow calls for next |
| `orchestrator --write` | the orchestrator of a project with Drupal services, from the code (the team's sections kept) |
| `detect --write` · `detect --index` | `project.json` from the services cloned · the indexes the tools read |
| `qa [--setup \| --off]` | the gate's code checks: missing, set up, or off by decision |
| `doctor` · `budget` · `promptcheck` | the set-up · what loads on every message · the lines a model gateway's injection filter blocks |
| `git -C <dir> …` · `run -C <dir> drush …` | read-only git and drush inside WSL (opencode on Windows) |
| `claude install \| project \| uninstall` · `hook …` | the Claude Code wiring and its hooks |
| `update [--agent …]` | a newer ai-core, or another agent |

All of them: `framework/scripts/README.md`.

## Stacks

| stack | detected by | gate | code index |
|---|---|---|---|
| `drupal` | composer.json with drupal/core | phpcs · phpstan · hook signatures · `drush cache:rebuild` · smoke · `config:status` | methods, services, routes, events, hooks, fields, UI strings |
| `java` | pom.xml + src/main/java, build.gradle | compile · Checkstyle · JUnit | classes, methods, beans, routes, listeners |
| `react-ts` | package.json with react + tsconfig.json | eslint · tsc · vitest / jest | components, functions, hooks, routes, i18n strings |
| `generic` | anything else | the commands in project.json `"gate"` | — |

Several stacks in one repository (a Drupal back end and a React front end) and several services in a workspace work
the same way: each has its paths and its exec, the gate runs each changed one in its own repository, and
`contracts` maps who exposes and who calls each HTTP endpoint between them. SonarQube: `gate --sonar` for every
service with a `sonar.projectKey`. Java gets its rules on every message; Drupal and React load theirs with the service.

## Updating a project

`update-ai-framework` in a terminal at the root of the project, or `/update-ai-framework` in the agent: it pulls this
repository (fast-forward only) and, when there is a newer commit, re-copies the framework into `.ai/` keeping the
stacks, exec and agents recorded in `project.json`. `--check` only tells. The knowledge (orchestrator, services,
skills, tickets, known issues, context) is never touched: the framework does not contain it. Then restart the agent,
review `git -C .ai diff` and commit. Each teammate runs it once on their machine too (the wiring is per machine).

## Changing the framework

The knowledge of this repository itself (architecture, the history of every improvement, decisions, skills for the
recurring work, known issues, three subagents) is in `.ai/`; `AGENTS.md` and `CLAUDE.md` at the root point to it, so
opencode and Claude Code open the repository already knowing how it works. Read `.ai/README.md` first.

Edit `framework/` here, run the tests, commit, then `update-ai-framework` in each project. A change made directly in
a project's `.ai/scripts` or `.ai/commands` is overwritten by the next update.

```bash
./selftest.sh            # every test, plus the Windows checks when run from WSL
node --experimental-strip-types --test tests/*.test.mts
```
