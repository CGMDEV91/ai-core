# Routing — roles, not brands

Detail of the delegation rule in `.ai/non-negotiables.md` and `.ai/METHODOLOGY.md §0`.

This file names **roles**. It never hardcodes a vendor, a product or a model version — those rot,
and a routing table that names a model you no longer have is worse than no table: agents follow it
anyway and then claim they delegated when they didn't. Migrating to another model or another tool
means editing **one** table: *Active setup*.

---

## The four roles

| Role | What it does | What it must NEVER do |
|---|---|---|
| **Orchestrator** | Understands the objective, breaks it into tasks with acceptance criteria, decides architecture, reviews every diff, verifies against the gate, owns the ticket file (`.ai/tickets/<Jira key>/<Jira key>.md`) | Mechanical typing it could delegate: sweeps, renames, repetitive migrations, bulk test writing |
| **Executor** | Implements ONE closed, scoped task and reports back what it did plus the gate result | Redefine the scope, decide architecture, or return kilometric logs instead of a summary |
| **Fresh-eyes reviewer** | Receives ONLY the diff plus the checklist, hunts for problems, returns a verdict with evidence | Have seen the reasoning that produced the code; approve with "looks good" and no list of what was checked |
| **Bulk / text** | Docs, messages, descriptions, mechanical inventories — in small batches (~20–50 items per call) | Touch business logic; swallow a giant task in one call (it hangs on timeout) |

The orchestrator is a role, not a person and not a model tier. In a single-model setup the same
model plays every role — what changes between roles is **which context it has**, and that is the
whole point.

---

## Active setup — the ONLY place to edit when the model or the tool changes

| Role | Model | Channel |
|---|---|---|
| Orchestrator | the machine-configured model (single-model setup) | main session |
| Executor | same model, empty context | `@executor` subagent |
| Fresh-eyes reviewer | same model, empty context | `/reviewer` → `@reviewer` subagent (read-only) |
| Bulk / text | same model, empty context | `@executor` subagent, batches of 20–50 |

- **Mode:** A — single model (see below).
- **Last verified:** 2026-08-10 — `opencode debug config` on a developer workstation.
- **How to check what is actually configured:** `opencode models` (available) and
  `opencode debug config` (resolved `model` / `small_model` / `permission`). Do not copy model
  identifiers into this file: read them from the tool. If the configuration lives machine-wide,
  say so here and stop — nothing to set up per project.

**When you migrate:** change this table and the Mode letter. Nothing else in the methodology
changes — that is the point of routing by role.

---

## Mode A — one model plays every role (the current setup)

This is the normal case for a self-hosted model, not a degraded exception.

**What you CANNOT have, and must never claim:** model diversity. There is no second vendor, no
second family, no second set of training priors. Any statement like "reviewed by a different
model" is a lie. If someone needs cross-vendor review, that is Mode B and it requires a second
model to actually exist.

**What you DO get: context isolation.** A subagent invoked for the review starts with an empty
context. It never saw the reasoning that produced the code, so it is not anchored to it: it cannot
think "I already decided this is correct" about a decision it never made, and it cannot inherit an
assumption it never heard. That is a real, observable improvement over reviewing in the same
thread — and it is strictly weaker than model diversity, because the reviewer shares the model's
blind spots. **The same weakness that produced the bug can miss it again.** Say this plainly when
reporting a review; never inflate it.

**Mandatory compensations in Mode A:**

1. **Checklist, not open judgement.** The reviewer works from a closed list (the rules in
   `.ai/rules/`, the "Pattern to watch" lines of `.ai/known-issues/`, the project's
   non-negotiables) and reports per item. Open-ended "review this" degrades fast without diversity.
2. **`/security` is a separate pass**, not a bullet inside `/reviewer` — a different starting
   context finds different things.
3. **Human second opinion before commit** for anything touching authentication, SQL, public API
   contracts or the data model. This is the only genuine diversity available in Mode A, and it is
   not optional for those areas.
4. **The gate still decides.** Build and tests are the one reviewer that is not a language model.
   No amount of agent review substitutes for green (`.ai/procedures/gate.md`).

---

## Mode B — several models available

If the installation has more than one model, fill *Active setup* with which model takes each role
and add one rule: **the fresh-eyes reviewer must be a different model from the executor.** Then
the review is both context-isolated and prior-isolated, and the honesty caveat above lifts.

Keep the roles as they are. Cross-vendor CLIs (a second agent tool driven from the terminal) are
just another channel in the Channel column — nothing conceptually new.

---

## Delegation rule

**Delegate when** the task is either:
- **high volume / low judgement** — sweeps, log reading, broad exploration, mechanical inventories.
  The point is protecting the orchestrator's context, not the model's ability; or
- **required to be independent** — review, audit, verification of someone else's claim.

**Do NOT delegate when** the task needs the accumulated design context: it will be reconstructed
badly and cost more than doing it. Splitting a task just to be able to say you delegated is theatre.

When in doubt on a mechanical task, delegate. When in doubt on a design task, keep it.

---

## Channel honesty (non-negotiable)

If a role's channel is not available in your session — subagents disabled, tool missing, permission
denied by policy — then:
1. Do the work in the channel you actually have.
2. **Write it down in the ticket's `Notes`** (`.ai/tickets/<Jira key>/<Jira key>.md`): which role could not be
   routed, and what you did instead.
3. Never describe work as delegated, independently reviewed, or cross-checked if it wasn't.

An unverifiable claim about process is the same class of error as an `[ASSUMED]` fact reported as
`[VERIFIED]`.

---

## Antipattern to avoid

> **An orchestrator that types.** It ends the session with its context burned on mechanical edits,
> no margin left to keep directing, and no independent pass over its own work. If you catch
> yourself writing feature code in the main session while a subagent channel is available, stop
> and delegate.

Its mirror image, equally bad: **delegating the thinking.** Handing a subagent "figure out the
architecture and implement it" is not delegation, it is abdication — the orchestrator no longer
knows what it is reviewing.
