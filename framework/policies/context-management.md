# Context management — how not to lose the thread

## The golden rule

> If it changes every sprint, it does not go in the orchestrator. If it is true all the time about the system, it does. If it is true of ONE service, it goes in that service's `service.md`.

There is no entry file in any service: `.ai/orchestrator.md` is injected into every session through
the `instructions` the installer (`.ai/install/`) writes into the user's opencode configuration,
together with `.ai/non-negotiables.md` and the rules. Filling it with unstable or irrelevant content degrades the
model's performance — it is documented behavior, not speculation. Keep it below ~120 lines: the
services table, what is common to every service, and routing to detail files — never the detail
itself, and never the facts of a single service. Those live in `.ai/services/<name>/service.md`
(under ~80 lines each) and enter the context only when a ticket lists that service
(`.ai/METHODOLOGY.md §10`). Status that changes session to session does not go in either: it goes
in the ticket file (`.ai/tickets/<Jira key>/<Jira key>.md`).

## One status file per ticket

The antidote against context loss in long sessions is not writing more documentation: it is
having **only one** status file per piece of work, with strict format and limited size, which is
re-read before each step and updated at the end of each session — `.ai/tickets/<Jira key>/<Jira key>.md`,
managed by the ticket commands through `.ai/procedures/intake.md` (template
`.ai/templates/ticket.template.md`):

1. **Front matter** — the intake fields, and `services:` — the repos the ticket may touch (context
   and permission in one list).
2. **Intent · Boundaries** — what has to be achieved and what must not change.
3. **Current state** — the truth NOW, ≤10 lines, overwritten each session, ends with `Next:`.
4. **Prior art · Analysis · Impact analysis** — what was searched, and the analysis in the Jira format.
5. **Changes · Verification · Test instructions** — what changed per service, and the checks with the
   service each command ran in and the evidence line.
6. **Notes** — `Decision (date):`, `Assumption:`, `Open question:`, `Dead end:`, written as they happen.
7. **Session log** — append-only, one entry per session. **Closure** at the end.

One writer per file (the ticket's owner and their agent), so ticket files never conflict. What is
true of the whole project and changes rarely is **not** status: it lives in `.ai/CONTEXT.md`, in named
sections — *Permanent decisions*, *Manual test procedures*, *Technical data* (template
`.ai/templates/CONTEXT.template.md`) — changed only through its own pull request. The backlog lives
in Jira.

**Forbidden to create a new planning/notes `.md` per session.** All the status of a piece of work
goes inside its ticket file; `Current state` is overwritten, not extended, and the status is not
distributed across several loose files.

This prohibition applies to **STATUS**. It does not apply to the knowledge base
(`.ai/services/<name>/context/`, `.ai/integrations.md`, `.ai/skills/` — updated by events per the
staleness tables), to the persisted plans (`.ai/plans/<Jira key>-plan.md`), nor to the history (the
tickets' `Session log`, one file per confirmed issue in `.ai/known-issues/`). The natures of
information and their rules: `.ai/policies/knowledge-maintenance.md` and `.ai/session/tracking.md`.

## Mandatory veracity labels

Always separate what's verified from what's assumed:
- `[VERIFIED <date> @<sha> — "<evidence>"]` — verified on this machine: the command was run and
  `<evidence>` is the output line that proves it (`BUILD SUCCESS`, `Tests run: 12, Failures: 0`, the
  failing assertion of a regression test run before the fix). A `[VERIFIED]` without the evidence
  fragment fails the hygiene check at closure.
- `[VERIFIED-BY-HUMAN <date> @<sha> — "<evidence>"]` — the human ran it and gave the line (a gate
  longer than the tool timeout, an environment the agent cannot reach).
- `[ASSUMED]` — read in documentation, old commits or a catalog, not verified.
- `[QUESTION]` — a fact only the team can provide; left by `/start`, counted by the commands until
  answered.

Any important statement without a label is treated as `ASSUMED`. Converting an `ASSUMED` into
`VERIFIED` is first-class work, not an optional extra. An integrations row derived from a
`catalog-info.yaml` is `[ASSUMED]` until the client, listener or call is found in the consumer's code.

## The rule of someone else's WIP

If at the start of a session there is uncommitted work from another session (`git status` dirty — in
the knowledge repo or in the code repo of any service), it is **forbidden to modify, revert or
commit** those files without first:
1. Reading the diff and understanding what it was.
2. Recording it (a `Notes` line of the current ticket).
3. Deciding if it is finished, left explicit as WIP, or discarded — never in silence.

The rule applies to the services' code. The knowledge repo is not inspected at all: what is or is
not committed under `.ai/` is the developer's business — the commands propose commit messages and
never look.

## Compaction

**Of the files.** The ticket's `Current state` is **overwritten** every session and stays ≤10
lines: it reflects the present of the work, not its history. The history is the `Session log`
(append-only, one entry per session, written at session end after the human confirms). In
`.ai/CONTEXT.md`, *Technical data* is rewritten when it changes and *Permanent decisions* is
add-only.

**Of the conversation.** Compaction of the session is automatic, and anything not written to a file
is gone. After a compaction, re-read the ticket file before acting, say so, restate `Current state`,
`services:` and the next action, and confirm with the human (`.ai/procedures/intake.md` → §4).
Better before it is forced: when ▶ Next says *compact the conversation* (a big conversation, and the phase just
passed its gate), update your diary's `## Current state` and tell the human to run `/compact`. Never mid-phase.

## What goes where

| Type of information | Where it goes |
|---|---|
| The services of the system: folder, type, base branch, gate, owner; conventions common to all | `.ai/orchestrator.md` (injected every session through the installed `instructions`) |
| Stack, modules, run commands, conventions, restrictions of ONE service | `.ai/services/<name>/service.md` (loaded by the ticket commands for the ticket's services) |
| Architecture / data model / API detail of one service | `.ai/services/<name>/context/<area>.md` |
| Who provides and who consumes each contract; shared resources; dependencies outside the workspace | `.ai/integrations.md` |
| Business workflows (actors, rules, edge cases — across services) | `.ai/skills/` (index: `README.md`) |
| Gotchas agents keep tripping on | That service's `service.md` → Known Gotchas; system-wide → `.ai/orchestrator.md` → Known Gotchas (system-wide) (via `/learning`) |
| Live status of a piece of work (services, state, decisions, dead ends, verification) | `.ai/tickets/<Jira key>/<Jira key>.md` |
| Project-level context that changes rarely (permanent decisions, manual test procedures, technical data) | `.ai/CONTEXT.md` (changed by pull request) |
| Prioritized pending work | Jira (and the `Next:` line of each ticket) |
| Session-by-session history | The ticket's `## Session log` (append-only) |
| Your own journal and time | `.ai/MEMORY.local.md` (personal, never committed) |
| Confirmed issues + recurring patterns ("Pattern to watch") — any service | `.ai/known-issues/<Jira key>.md` (one file per issue) |
| The flow of each kind of work, and the shared steps | `.ai/commands/` (opencode exposes them as `/name` via the installed stubs) · `.ai/procedures/` |
| The rules in force with or without a command | `.ai/non-negotiables.md` |
| The tool wiring | `.ai/install/` — the stubs, agents, instructions and permission baseline, installed once per machine |
| Agent allow/deny lists | `.ai/policies/permissions.md` (and the baseline in `.ai/install/opencode/opencode.global.json`) |
| When NOT to use AI | `.ai/policies/no-ai-zones.md` |
| A business rule of a workflow | Its skill (`.ai/skills/`); without a skill, the ticket's `Decision (YYYY-MM-DD):` lines in `Notes` — never `.ai/CONTEXT.md` |
| Decisions taken on a ticket | `Decision (YYYY-MM-DD):` lines in the ticket's `Notes`; project-wide permanent ones → `.ai/CONTEXT.md` → Permanent decisions |
| Plans | `.ai/plans/<Jira key>-plan.md` |
| Context of a specific task | Its ticket file — never a new file |
| Temporary workarounds | The ticket's `Notes` (or the known issue's `Workaround`), never the orchestrator or a `service.md` |
| Who works on what | Do not give it to the AI |

## Signs that the orchestrator is bloating

- Mentions a specific ticket number.
- Mentions a person's name.
- Carries a date (other than inside Known Gotchas provenance).
- Describes the modules, the stack or the conventions of ONE service → that belongs in its
  `service.md`; the orchestrator keeps one row per service.
- Has more than 2 lines in a row about the same specific topic → that detail belongs in a
  `context/` area or a skill, with one routing row in "Reference Files".
- You haven't touched it for 3 months but it keeps growing.

The same signs apply to a `service.md`: a section longer than a screen belongs in that service's
`context/`.

## Signs that the orchestrator (or a `service.md`) is falling short

- The agent keeps asking what framework a service uses, or which folder it lives in.
- The agent suggests patterns that the service does not use.
- The agent tries to execute commands that do not exist in your environment, or runs a gate in the
  wrong folder.
- The agent changes a contract without naming its consumers → `.ai/integrations.md` is missing a row.
- The agent produces output in a format different from the one agreed upon.
- The agent keeps rediscovering the same business rule → that rule belongs in a skill.

## Review cadence

Review `.ai/orchestrator.md` every time a service is added or removed, and a `service.md` every
time you start a large feature in that service. Ask yourself: "is all this still true? is
something new missing?" For structural drift, `/restart <service>` re-explores a service and
`/restart` the system table and the integrations map, protecting the manual sections.

## Context budget in session

When pasting additional context (code, logs, diffs):
- Paste only what is directly relevant to the current task.
- Never paste an entire service — paste only the method in question.
- Never paste logs of more than ~50 lines — summarize the rest.
- Never paste `.env`, secrets, passwords, or production data.
- Never load the `service.md` of a service the ticket does not touch "just in case".
