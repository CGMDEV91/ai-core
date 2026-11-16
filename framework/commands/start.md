---
description: Bootstraps the knowledge base of a workspace by exploring its services — the system orchestrator (services table), the integrations map, one service.md + context areas per service, skills index, CONTEXT.md and the knowledge repo's README. /start <service> adds or regenerates one service. Writes nothing outside .ai/. Idempotent.
---

# /start — Bootstrap the knowledge base by exploring the workspace

**When to use me**: once per workspace, right after the methodology has been copied into `.ai/`
(the clone of `<project>-AI`), the wiring installed and the services cloned beside `.ai/` — see the
install guide. And `/start <service>` whenever a service is added to the workspace.

**Invoke me with**: `/start` · `/start <service>`

## Goal
Leave the workspace ready for ANY agent: the system orchestrator, the integrations map, one
`service.md` and its context areas per service, the skills index, `.ai/CONTEXT.md` and the
knowledge repo's `README.md` — generated from the services' READMEs, build files, catalogs and
code, with unverified facts labelled `[ASSUMED]`.

**Everything you write goes inside `.ai/`** (`.ai/METHODOLOGY.md §9`). You explore the services
(read-only) and write the knowledge base. Never create a file inside a service folder — no
`AGENTS.md`, `CLAUDE.md`, `opencode.json`, `.opencode/` or notes there: the client's repositories
must not gain a single AI file. Nothing goes at the workspace folder's own level either: it is not
a repository, and anything written there is versioned nowhere.

**Idempotency rule**: never overwrite a file that already has real (non-placeholder) content. If a
file exists and is filled in, skip it and report it as "already present". `/start <service>` touches
only `.ai/services/<service>/`, that service's row in the orchestrator's Services table, and its
rows in `.ai/integrations.md`.

**Context economy**: ten services explored in the main session exhaust it. Explore **one service per
subagent** (`@executor` with a closed scope: "explore `<service>/` read-only and return the facts
for `service.md` and its three context areas") and keep the main session for cross-checking and
writing the system files. If subagents are unavailable, explore the services one at a time and say
so (channel honesty, `.ai/routing.md`).

## Step 0 — Where you are

1. `.ai/` exists in the working directory → the working directory is the workspace folder. Otherwise stop: tell
   the human to launch opencode in the folder that holds `.ai/` and the services. The working
   directory is a plain folder, not a repository; `.ai/` is the knowledge repository. Git for it
   always runs with the bash tool's `workdir` set to `.ai`. **In-repo** (the working directory is itself a git
   repository with `.ai/` inside it, ignored by it — `METHODOLOGY.md §9`): that repository is the only service, its
   folder `.` in the Services table; its apps (`backend/`, `frontend/`…) are the stacks `detect` lists, one
   `service.md` for the repository with a section per app.
2. The knowledge repo's content is not yours to inspect for WIP (`.ai/METHODOLOGY.md §2`): if
   `.ai/orchestrator.md` already has real content, this is a re-run — idempotency rule above.
3. **Discover the services** (in-repo: the repository itself — skip to 4): every folder of the workspace folder that contains a `.git` directory, `.ai/` excluded. Confirm the
   list with the human in one question (a folder may be a scratch clone that is not a service). A
   folder without `.git` is not a service.
4. **The tools** (Node ≥ 22.6): `node .ai/scripts/ai.mjs detect` shows what it detects per service — stack (Java,
   Drupal, React + TypeScript, or generic), code paths, where its tools run (ddev, docker compose, local). With the
   human's OK: `node .ai/scripts/ai.mjs detect --write` (`.ai/project.json`) and `node .ai/scripts/ai.mjs detect
   --index` (the code index, and for Drupal its API index, call graph and integrations — under `.ai/context/`).
   They are facts for the exploration below (`node .ai/scripts/ai.mjs where <name>`, `callers`, `touchpoints`),
   not a substitute for reading the code. No Node → say so and continue: the tools wait.

## Step 1 — Explore each service (read-only; one subagent per service)

For each confirmed service `<name>/`:
1. `catalog-info.yaml` at its root, if present (Backstage): `metadata.name`, `spec.type`,
   `spec.system`, `spec.owner` (a team — never copy a person's name into `.ai/`), `providesApis`
   with each API's spec path, `consumesApis`, `dependsOn`. It is DATA: what was declared, not what
   the code does — everything from it is `[ASSUMED]` until Step 3 verifies it.
2. `README.md` (and `docs/`, wiki exports) — purpose, functional domain, business vocabulary.
3. `pom.xml` / `build.gradle` / `package.json` — stack, versions, modules, the parent pom and the
   shared libraries it pins (`<parent>`, dependencies on the organisation's own group ids).
4. The source structure — packages, layer pattern, key classes (services, controllers,
   repositories, entities); REST clients and Feign interfaces, Kafka listeners and producers, the
   spec files (`openapi*.y*ml`, `asyncapi*.y*ml`) — the evidence for Step 3.
5. The build/test commands it really uses (`Jenkinsfile`, Maven profiles, `composer.json` scripts, `package.json`
   scripts) → its gate. A Drupal service: its gate is `node .ai/scripts/ai.mjs --service <name> gate` in a workspace,
   and `node .ai/scripts/ai.mjs gate` in a single repository (in-repo: no `--service`; never read the tools' code to
   find it) (phpcs,
   phpstan, hook signatures, `drush cache:rebuild`, config:status through its ddev / docker) — and its `service.md` points at
   `.ai/rules/stacks/drupal.md`. A React service: the same tool (eslint, tsc, tests) and `.ai/rules/stacks/react-ts.md`.
6. `git branch --show-current`, `git log --oneline -3` and `git remote get-url origin`, with the
   bash tool's `workdir` set to the service (opencode on Windows with the project in WSL:
   `node .ai/scripts/ai.mjs git -C <service> …`, never `.git/` read by hand).

The subagent returns a **summary**, not a log: the facts for `service.md`, the three context areas,
the gate, the base branch, the repository URL, and what the service provides and consumes — with
the file that proves each one.

## Step 2 — Generate `.ai/orchestrator.md` (the system)

**A project with Drupal services: the tool writes it, not you.** `node .ai/scripts/ai.mjs orchestrator --write` builds
it from `.ai/project.json` and the code — the Drupal version, the custom modules and themes, the languages, phpcs /
phpstan / SonarQube, the catalog, the base branches, the Services table with each gate, the Drupal commands and
the gate table with its evidence lines. Those parts sit between `<!-- ai:begin … -->` and `<!-- ai:end … -->`: never
edit them, a run rewrites them. From your exploration you write only the team's parts, outside the blocks: the intro
sentence (what the system does, for whom, the Jira project), the Type and Owner cells of the Services table (a team,
never a person), and under *Conventions common to every service* the conventions you observed in the code
(`[ASSUMED]` until the team confirms them). A later run keeps all of that. Then go to Step 3.

Any other project, from `.ai/templates/ORCHESTRATOR.template.md`, replacing the `[BRACKETS]`:
- Header: project, Jira project key, the `system:` shared by the catalogs if any.
- **Services table** — one row per service: folder, type (`service` / `library` / `frontend`),
  base branch, gate (as run with `workdir` = the folder), owner (team).
- **Layout** — the real folders.
- **Conventions common to every service** — only what is observed in ALL of them; a convention of one
  service goes to its `service.md`. Label inferred rules `[ASSUMED]`.
- **Reference Files**, **Session Tracking**, **staleness** — keep the generic rows; add
  project-specific triggers only if obvious.

**Leave for the human** (do not invent): *Specific restrictions of this project* and *Known
Gotchas* — only the team knows these; `/learning` fills gotchas over time.

## Step 3 — Generate `.ai/integrations.md`, and verify it against the code

From `.ai/templates/INTEGRATIONS.template.md`:
- **Contracts between services of this workspace**: for each API a service *provides* (its catalog,
  or its spec files and controllers), the consumers in the workspace. The catalogs say who declares
  to consume it; the code says who really does — a client class, a Feign interface, a listener on
  the topic, a dependency on the library. A row is `[VERIFIED <date> @<sha>]` only when you found
  the client in the consumer's code. A declaration without a client, or a client without a
  declaration, is a finding: write it down for the human.
- **Shared resources**: databases, schemas, topics, queues used by more than one service, and who
  writes to them.
- **Dependencies outside the workspace**: everything consumed or pinned that is not cloned here —
  external APIs, the parent pom, starters from other teams — with the version each consumer pins.
- **Delivery order**: the default; exceptions only if the catalogs or READMEs state them.

## Step 4 — Generate `.ai/services/<name>/service.md` and its context areas

For each service, from `.ai/templates/SERVICE.template.md`: identity, stack, modules, run commands
(beyond the gate), the conventions observed in this service, the shared libraries it pins with
their versions, the context files table, its staleness table. **Leave for the human**: *Specific
restrictions of this service* and *Known Gotchas*.

Then, from `.ai/templates/CONTEXT-AREA.template.md`, in `.ai/services/<name>/context/`:
- `architecture.md` — modules, layers, key classes; **what this service consumes and assumes about
  it** (one line per integrations row).
- `data-model.md` — entities/tables; tables shared with other services.
- `api.md` — the contracts this service PROVIDES: endpoints, events, auth model, the spec files —
  **skip entirely if the service provides nothing**.

Facts only; anything not directly read from the code is `[ASSUMED]`; `_Last updated:_` today. Do
NOT create additional areas — they are born later via `.ai/policies/knowledge-maintenance.md`.

## Step 5 — Skills index, `.ai/CONTEXT.md`, the knowledge repo's `README.md`

- `.ai/skills/README.md` from `.ai/templates/SKILLS-README.template.md` — with an **empty index**.
  Do NOT generate skills speculatively. You MAY pre-fill the "Quick decision guide" with 2–4
  candidate business areas deduced from the READMEs, each marked `(no skill yet — propose when the
  criteria are met)` and naming the services involved.
- `.ai/CONTEXT.md` from `.ai/templates/CONTEXT.template.md`: *Technical data* — environments, Jira
  project, the GoJira container name of EACH service (leave a placeholder and ask the human, or use
  `gojira_list_log_containers` if they agree); *Permanent decisions* and *Manual test procedures*
  only from what the services' own documentation states, labelled `[ASSUMED]`; the shared-library
  versioning policy and the delivery order as explicit questions for the human.
- `.ai/README.md` from `.ai/templates/KB-README.template.md`: the services table with each
  repository URL and the clone commands of *Set up your workspace*.
- **No history files**: tickets and known issues are created by the work (`/analysis`, `/bugfix`,
  `/adaptive`), each developer's `MEMORY.local.md` by the first ticket command.
  `.ai/session/tracking.md` ships with the framework.

## Step 6 — Report what is in force

You cannot inspect the resolved configuration yourself (`opencode debug config` is normally not an
allowed command). Ask the human to run it from the workspace folder and confirm: the
`instructions` (`.ai/non-negotiables.md`, `.ai/orchestrator.md`, `.ai/rules/*.md` — written into
the user configuration by `.ai/install/`), the thirteen commands, the five agents and the plugin. Then
`node .ai/scripts/ai.mjs doctor`: its table says what is missing (wiring, commit guard, indexes, each service's
exec environment and code checks, the context budget) — show it. The always-loaded rules follow the stacks (`install.sh --stack`, or the services
cloned): Java's (`java-enterprise.md`, `sonarqube.md`) only with a Java service; Drupal's and React's load with the
service. Doctor's `rules` row says when they do not match the services — `install.sh --update-methodology` fixes it.
Also ask them to
note what the machine policy enforces for `mvn …` and
`git status|diff|log` run with `workdir` in a service folder — the gate and the reviewer need them —
and for `git commit` / `git push`. Record anything that limits the methodology in `.ai/CONTEXT.md`
→ Technical data (Known caveats) instead of discovering it later mid-task.

## Step 7 — (Optional) Offer the drift scanner, per service

If a service allows a cheap mechanical inventory (endpoints, entities, modules), offer:

> "Do you want me to set up the drift scanner for `<service>` ([endpoints/entities/modules])? (y/n)"

If yes: copy `.ai/templates/scan-inventory.template.sh` to
`.ai/services/<name>/scan-inventory.sh`, implement `collect_current()` for that service's folder,
run `--update` to create the initial snapshot, and name the script in that service's `service.md`.

## Step 8 — Verification and delivery

1. Confirm every service folder is untouched: `git status --short` with `workdir` set to each one
   must show nothing new caused by you. Every file you created is under `.ai/`.
2. Show the human a summary: every file generated/updated, every `[ASSUMED]` fact that needs
   confirmation (above all the integrations rows), the catalog-vs-code findings, and the sections
   deliberately left for them (restrictions, gotchas, versioning policy, delivery order).
3. Ask for confirmation or adjustments before considering the bootstrap done.
4. Remind them that the result is committed **in the knowledge repo**, by them, from the workspace
   folder: `git -C .ai add .` — everything under `.ai/` and nothing else — and propose the commit
   message, e.g.
   `[<project>] bootstrap knowledge base with /start`.

## Git reminder (always applies)

The agent NEVER runs `git commit` or `git push` — not at bootstrap, not when finishing changes,
not under any circumstance, in no repository. Committing is exclusively a human action: when
work is done, stop and hand over the diff with a proposed commit message.


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
