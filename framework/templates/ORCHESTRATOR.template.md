# [PROJECT_NAME] — Orchestrator (the system)

<!--
  A project with Drupal services does not use this template: `node .ai/scripts/ai.mjs orchestrator --write` builds
  the file from the code (and uses the "Where things live" table below).
  Single source of SYSTEM facts — the map. Generated as .ai/orchestrator.md by /start, curated by
  hand, updated by /restart. Always loaded (the installed instructions): keep it under ~60 lines. It says what
  the system is and where everything lives. It carries NO process (the commands and
  .ai/procedures/ do) and no facts of a single service (.ai/services/<name>/service.md, loaded per
  ticket). Remove all [BRACKETS] and these instruction comments before using.
-->

[PROJECT_NAME] — [one sentence: what the system does and for whom]. [N] services and [M] libraries
cloned in this workspace, Jira project `[KEY]`, base branch `[master]` unless the table says otherwise.
Catalog: [`system:<…>` shared by the services' `catalog-info.yaml`, if they have one — otherwise "none"].

## Services

<!-- One row per service or library whose code is cloned in this workspace. Folder = the code folder
     in the workspace folder (= the name of .ai/services/<name>/). Gate = the command that says NO,
     run with the bash tool's workdir set to that folder; [ASSUMED] until it has run once. Owner = a
     team or role, never a person. A single repository (in-repo): one row, Folder `./`, and the
     gate `node .ai/scripts/ai.mjs gate` (no --service). -->

| Service | Folder | Type | Base branch | Gate (`workdir` = folder) | Owner |
|---|---|---|---|---|---|
| [service-a] | `[service-a]/` | service · [one-line role] | `[master]` | `mvn …` | [team] |
| [service-b] | `[service-b]/` | service · [one-line role] | `[master]` | `mvn …` | [team] |
<!-- In-repo (one repository, .ai/ inside it): one row, folder `.` — its apps are the stacks of .ai/project.json -->
| [library-c] | `[library-c]/` | library · pinned by [services] | `[master]` | `mvn …` + its consumers compile (`.ai/METHODOLOGY.md §10`) | [team] |

Libraries that are NOT cloned here: `.ai/integrations.md` → Dependencies outside the workspace. The
facts of a service: `.ai/services/<name>/service.md` — loaded by the ticket commands for the services
the ticket lists in `services:`, never all at once.

## Conventions common to every service

### Architecture — non-negotiable
- [KEY RULE shared by all services — e.g. "Controllers delegate 100% to services — zero business logic in controllers"]
- Always use [Logback/Log4j2] — never `System.out`.
<!-- A rule that holds in ONE service only goes in that service's service.md. -->

### Code style
- [e.g. naming conventions, exception handling pattern, DTO vs entity rules, no magic numbers]
- Code comments, identifiers and docblocks are always in English, regardless of the language used in conversation with the user.

### Specific restrictions of this project
<!-- Rules that bind every service and would surprise a new developer. Only the human/team knows
     these — /start leaves them empty. A restriction of one service goes in its service.md. -->
- [e.g. "No new Maven dependencies without justification — pending license review"]

### Known Gotchas (system-wide)
<!-- Living list. /learning appends here only gotchas that span services — a gotcha of one service
     goes to its service.md. Never delete entries. Empty at the beginning. -->
- [empty]

## Where things live

| Need | File |
|---|---|
| The facts of ONE service (stack, modules, run commands, restrictions, gotchas) | `.ai/services/<name>/service.md` · its `context/` (architecture · data-model · api) |
| Who provides / consumes each contract; shared resources; dependencies outside the workspace | `.ai/integrations.md` |
| Live status of a piece of work (services, state, decisions, dead ends, verification) | `.ai/tickets/<Jira key>/<Jira key>.md` — written by `/analysis`, `/bugfix`, `/adaptive` |
| Has this failed before? (any service) | `.ai/known-issues/` — search with an explicit path |
| Permanent decisions, manual (integration) test procedures, technical data | `.ai/CONTEXT.md` |
| Business workflows (per actor/scenario, across services) | `.ai/skills/README.md` |
| The commands' procedures · the shared procedures (session start, intake, gate, review, session end, close) | `.ai/commands/` · `.ai/procedures/` |
| The full process and why it is like this | `.ai/METHODOLOGY.md` (humans: `.ai/HOW_TO.md`) |
| Roles: who orchestrates, who executes, who reviews | `.ai/routing.md` |
| Hard coding rules (Java · SQL · auth) | `.ai/rules/` |
| The SonarQube verification gate (post the scan, query new issues) — services with a `sonar.projectKey` | `.ai/procedures/gate.md` (Java: `.ai/rules/sonarqube.md`) |
| What is written where, and when | `.ai/session/tracking.md` |
| Growth criteria · permissions · no-AI zones · context policy | `.ai/policies/` |
| Your own journal and time (personal, never committed) | `.ai/MEMORY.local.md` |

## Staleness — system level (each service has its own table in its `service.md`)

| Change | File to update, in the SAME ticket |
|---|---|
| Service or library added, removed, renamed — or its gate / base branch changed | This file → Services · `.ai/integrations.md` |
| A `catalog-info.yaml`, or a spec (openapi / asyncapi) added, removed or changed | `.ai/integrations.md` + the provider's `context/api.md` — the consumers listed are named as possibly affected in the ticket |
| A contract between services changed | The provider's `context/api.md` · `.ai/integrations.md` · the ticket's list of possibly affected components |
| Business rule added or changed | The relevant `.ai/skills/` file (or propose a new one) |
| Log container/service name changed (`gojira_list_log_containers`) | `.ai/CONTEXT.md` → Technical data (through its own pull request) |
| [project-specific trigger] | [file] |
