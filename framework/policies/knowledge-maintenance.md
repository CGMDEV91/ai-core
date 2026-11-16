# Knowledge maintenance — when and how the knowledge base grows

Governs `.ai/services/<name>/` (each service's facts and context areas), `.ai/integrations.md`,
`.ai/skills/`, the history (`.ai/tickets/`, `.ai/known-issues/`) and (optionally) the agents in
`.ai/install/opencode/agents/`: what gets created, when, by which criteria, and how it stays in sync with the
code. Complements `.ai/policies/context-management.md`, which governs the orchestrator, the ticket
files and `.ai/CONTEXT.md`; what is written where, and when, is in `.ai/session/tracking.md`.

The goal: the project's knowledge **compounds** across sessions instead of being rediscovered
every time — without drowning the repo in speculative documentation nobody maintains.

---

## The natures of information (never mix them)

| Nature | Behaviour | Where it lives |
|---|---|---|
| **Live status of a piece of work** — state, decisions, dead ends, verification | ONE file per ticket, one writer; `Current state` overwritten (≤10 lines) | `.ai/tickets/<Jira key>/<Jira key>.md` |
| **Project-level context** — permanent decisions, manual test procedures, technical data | One file, changed rarely, only by its own pull request | `.ai/CONTEXT.md` |
| **Stable knowledge** — the system, each service, the contracts, business workflows | Many files, updated by EVENTS (staleness tables), not per session | `.ai/orchestrator.md` · `.ai/services/<name>/` · `.ai/integrations.md` · `.ai/skills/` |
| **History** — what happened, what broke and why | Only appended, never rewritten | The tickets' `Session log` · `.ai/known-issues/<Jira key>.md` (one file per confirmed issue, any service) |
| **Personal journal and time** | Local, never committed | `.ai/MEMORY.local.md` |

The `.ai/METHODOLOGY.md §2` rule "forbidden to create other planning or status `.md` files" applies
to **STATUS**. Knowledge files are not status: they change when the code they document changes.
History is not status either: it only grows, and only after the human's confirmation.

---

## Staleness discipline — docs update in the SAME task

`.ai/orchestrator.md` carries a system-level staleness table ("change X → update file Y"), and
every `service.md` carries its own. The discipline is:

1. The doc update belongs to the **same task** as the code change — never "later".
2. A task that changed behaviour documented in a context/skill file and did not update that file
   is **not Done** (this extends `.ai/METHODOLOGY.md §5`). A task that changed a contract and did
   not update the provider's `context/api.md`, the row in `.ai/integrations.md` and check every
   consumer listed there is not Done either (`§10`).
3. Every context file carries a `_Last updated:_` date — refresh it on every edit.
4. If a scan script exists (see below), it is the safety net, not the mechanism: rely on the
   staleness tables first.

---

## Creating a new SKILL (business workflow file)

The criteria (recurrence · specialisation · payoff), how a skill is updated or created and how it is linked to its
tickets: `.ai/procedures/skills.md`. A skill holds verified knowledge only, and is created only after the human approves.

---

## Creating a new CONTEXT AREA (of a service)

`/start` creates three starter areas per service in `.ai/services/<name>/context/`:
`architecture.md`, `data-model.md`, `api.md` (skip `api.md` if the service provides nothing).
Create a **new** area when:

- The same cross-cutting technical topic of that service keeps being re-explained in sessions
  (e.g. "how batch jobs are scheduled here", "the caching strategy", "the multi-tenant resolution"),
  **and**
- It spans multiple business workflows (otherwise it belongs inside one skill), **and**
- It is stable knowledge, not status.

A topic that spans several services is not a context area: it is a section of `.ai/integrations.md`
(shared resources, delivery order) or a permanent decision in `.ai/CONTEXT.md`.

Propose it to the human first. On approval: create from `.ai/templates/CONTEXT-AREA.template.md`,
add a row to that service's "Context files" table in its `service.md` **and** to its staleness
table (what change triggers updating this new file).

When a context file outgrows ~200 lines, split it into a subfolder with one file per sub-item
and keep the parent file as the index — agents then read the index always and drill down only
when working on that specific item.

---

## Creating a specialized SUBAGENT

Subagents are not a niche extra: they are the mechanism that makes the **fresh-eyes reviewer** role
possible (`.ai/routing.md`). The base set ships with ai-core — `reviewer`, `security`,
`tester`, `executor`, `architect`. This section is about adding a *service- or module-scoped* one
on top.

The same three criteria (recurrence / specialisation / payoff), applied at service or module level:
when a **service, module or recurring cross-service concern** keeps being the root cause of work
that a generic agent handles poorly, propose a scoped subagent with:

- frontmatter (`description`, `mode`, and optionally `model` / `temperature` / `permission` —
  roles and channels per `.ai/routing.md`, never a hardcoded model version),
- explicit pointers to the `service.md`, skills and context files it must load,
- a "When NOT to use" section (prevents agent sprawl).

Where the file goes, per tool — never inside a service folder (`.ai/METHODOLOGY.md §9`):

| Tool | Location | Notes |
|---|---|---|
| opencode | `.ai/install/opencode/agents/<name>.md` — versioned in the knowledge repo; every teammate gets it with `git -C .ai pull` and a re-run of the installer | `mode: primary \| subagent \| all`. Invoked as `@name`, or pinned from a command stub (`.ai/install/opencode/commands/`) with `agent:` + `subtask: true`. Its own pull request, like any methodology change |
| Claude Code | not wired in this version of the methodology | — |

**Keep the prompt in the agent file, the procedure in `.ai/commands/`.** The agent file carries the
*stance* (who you are, what you may not do, output format); the command carries the *steps and the
checklist*. Duplicating the procedure into both is how they drift apart.

Propose before creating; never create agents speculatively. If the tool does not support subagents,
the same knowledge belongs in a skill instead.

> **Verify what a restricted agent can actually do.** A `permission:` block in an agent file is a
> *request*: a machine-wide or organisation-wide policy can override it and silently grant more.
> Check the resolved permissions with your tool (in opencode: `opencode debug agent <name>`) before
> relying on an agent being read-only — and write the agent's prompt so the rule binds it even when
> no tool enforces it.

---

## The snapshot + scan pattern (drift detection) — per service

**What:** a mechanically-extractable inventory of ONE service's code — Maven modules, Spring beans,
REST endpoints, JPA entities — frozen in a snapshot JSON under that service's `context/`. A script
diffs reality vs snapshot and prints `NEW:` / `REMOVED:` lines.

**Why:** documentation rots silently. A drift report at session start forces the doc update at
the cheapest possible moment — before work starts, while the change is still fresh in git.

**How to adopt it (per service, optional but recommended):**

1. Copy `.ai/templates/scan-inventory.template.sh` to `.ai/services/<name>/scan-inventory.sh`.
2. Implement `collect_current()` for ONE inventory of that service's stack (the template documents
   examples: endpoints, entities, modules). One inventory per script copy — a second inventory
   gets a second copy (`scan-endpoints.sh`, `scan-entities.sh`, …).
3. Run `bash .ai/services/<name>/scan-inventory.sh --update` once to create the initial snapshot.
4. Name the script in that service's `service.md` → Commands; the ticket commands run it for the
   services of the ticket at session start.

**Protocol when the scan reports drift:**

- `NEW:` → read the new class/config to understand it → update the corresponding
  `context/` file of that service → then `--update`.
- `REMOVED:` → remove it from the context file → check `.ai/skills/` and `.ai/integrations.md` for
  stale references → then `--update`.
- **Never run `--update` before the docs are updated** — that silently converts drift into
  permanent rot.
- Notify the user (in their language) of what was detected and registered.

---

## Ticket files, known issues and the personal journal

- Ticket files are created and maintained by `/analysis`, `/bugfix` and `/adaptive` through
  `.ai/procedures/intake.md` (`.ai/templates/ticket.template.md`); known issues are written at close
  (`.ai/procedures/close.md`, `.ai/templates/known-issue.template.md`), with the `services:`
  involved; each developer's `.ai/MEMORY.local.md` is created by the first ticket command
  (`.ai/templates/MEMORY.local.template.md`) and is git-ignored. All of them per
  `.ai/session/tracking.md`.
- **Confirmation-before-write is mandatory**: the agent asks the human (in their language) to
  confirm the work and the time before writing `Current state`, the `Session log` entry and the
  Journal line; a known issue is written only with a confirmed root cause or explanation. An
  unconfirmed fix logged as fixed is an `[ASSUMED]` disguised as `[VERIFIED]`.
- The "Pattern to watch" lines of `.ai/known-issues/` are the seed material for: skill "Related
  known issues" sections, context-area "Anti-patterns" sections, and `/learning` promotions to
  Known Gotchas — of one service, or system-wide when the pattern crosses services.

---

## Who does what (summary)

| Event | Action |
|---|---|
| Session start (`/analysis`, `/bugfix`, `/adaptive`) | Last 2 Journal lines of `.ai/MEMORY.local.md` + the ticket file (`.ai/procedures/intake.md`) and the `service.md` of its services + run the scan of each of those services if configured |
| Corrective ticket arrives | Prior art by similarity before touching code: `.ai/known-issues/` and `.ai/tickets/` (explicit path, any service) + `gojira_similar_incidents`; record `Prior art:` in the ticket |
| Code change lands | Apply the staleness tables in the same task: the orchestrator's, the `service.md` of each service touched, and `.ai/integrations.md` when a contract changed |
| A service enters or leaves the workspace | `/start <service>` or `/restart` (system level): the Services table, `.ai/integrations.md`, the knowledge repo's README |
| Session end | After the human confirms work and time: the ticket's `Current state` + `Session log` entry, one Journal line in `.ai/MEMORY.local.md` |
| Ticket closed (`.ai/procedures/close.md`) | Known issue when the resolution requires it · evaluate skill / context-area / subagent criteria — propose if all three pass |

None of these actions ever includes `git commit` / `git push` — the agent NEVER commits, in any
repository.
