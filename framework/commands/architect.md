---
description: Critiques an architecture or design proposal before implementing, separate from diff review — and persists an executable phase plan with the delivery order when several services change. Run by /bugfix and /adaptive when a change is not small, or on its own.
---

# /architect — design review and the plan

Use this to evaluate a technical decision, an integration, or the implementation of an adaptive,
development or non-trivial corrective ticket before writing code. It does not review changes
already made; for that use `/reviewer`. `/bugfix` and `/adaptive` run this procedure through the
`architect` agent whenever the change is 2+ files, 2+ services, or touches DB, API/contracts,
security or deployment; you can also type `/architect` yourself for a design discussion.

## Process

1. Read the real constraints: `.ai/orchestrator.md` (the system — already in your instructions, do not read it
   again; only if you do not see it there, read it), the ticket (`.ai/tickets/<key>/<key>.md`
   — `Intent`, `Boundaries`, `services:`, the analysis or impact analysis when there is one) and the
   `service.md` of each service it lists (`.ai/services/<name>/service.md`). If the task touches a
   documented business area, read the relevant `.ai/skills/` file first (index:
   `.ai/skills/README.md`); if it touches a contract between services — an endpoint, a schema, an
   event, a library — read its row in `.ai/integrations.md`: the consumers are part of the design,
   and the impact analysis's list of **components possibly affected** is your input. Search
   `.ai/known-issues/` (grep tool with that explicit path, any service) for "Pattern to watch" lines
   in the affected zone — a plan that ignores a known issue's pattern is not APPROVABLE.
2. Summarize the proposal and its assumptions. If a blocking piece of data is missing, ask for it.
   If the design needs a service the ticket does not list, say so: `services:` is updated (and that
   service's facts read) before the plan includes it.
3. Propose 2-3 real options, including "not doing it" if viable. Compare trade-offs, migration cost
   and compatibility with the project. For a change that crosses a service boundary, one of the
   options should keep the contract untouched.
4. List specific risks: security, data, deployment, operation, maintainability, performance,
   rollback — and, across services, the delivery order (the provider before its consumers, a
   library before the version bumps) and what breaks if it is not respected.
5. Make an explicit self-criticism before the verdict: what you are assuming · what could break
   even if the design seems correct · what evidence is missing · which part of the plan is most
   fragile.
6. Give a verdict: `APPROVABLE`, `REVIEW DESIGN`, or `NOT RECOMMENDED`, with verifiable conditions.

## If the verdict is APPROVABLE — the PLAN, executable and not vague

Produce an **executable phase plan for ANY agent**, using `.ai/templates/PLAN.template.md`:
- Phases: 0 read-only investigation · 1 core changes, the provider first · 2 consumers, integration,
  polishing. One phase per service when several change, in the delivery order.
- Atomic tasks (2–5 min) with **exact files prefixed with their service folder, concrete steps,
  acceptance criterion and rollback**. The first task of each phase carries the real test code and
  implementation code (the pattern the executor copies); the following tasks may use the shorthand
  `test: <Class#method> — asserts <one line>` and `impl: <file>:<method> — <one line>`.
- A task for every component the impact analysis marked as "change it in this ticket".
- The **design gate** (simplicity / anti-abstraction / integration / boundary).
- **Forbidden** vagueness: `TBD`, `TODO`, "implement later", "add appropriate validation/error
  handling", "manage edge cases", "write tests" without saying which. If a task cannot be described
  at that level, design is missing → back to critique.
- Budget: a plan over ~150 lines is two plans — one per service.
- Pass the template's **self-review** before delivering it.

**Where the plan is saved (always a file, never only the chat):** `.ai/plans/<Jira key>-plan.md`,
referenced from the ticket by a `Decision (YYYY-MM-DD): plan approved — .ai/plans/<key>-plan.md` line
in `Notes` (and the delivery order as a second `Decision` line), and by `Next:` while it is being
executed. The ticket commands re-read the ticket before each step and the ticket points at the plan —
so the plan survives compaction, and stays followable and reviewable.

Do not write implementation CODE: a plan is the output. If the human chooses "implement myself",
the implementation happens in the orchestrator session afterwards, not here.

## `/architect` vs. the tool's built-in read-only mode

Most tools ship a read-only exploration mode (opencode: the built-in `plan` agent). They are
complementary: the built-in mode for quick exploration with no fixed format and no persistence;
`/architect` for a verdict and a **persisted** plan with gates. A built-in mode may be pinned by
policy to write plans in `.opencode/plans/` in the workspace folder — outside every repository, so
no harm to a client, but outside `.ai/plans/`, versioned nowhere and invisible to the ticket commands. Persist plans only
from here, into `.ai/plans/`; if a built-in mode already wrote one there, move its content and tell
the human the stray file can be deleted. Never write a plan inside a service folder.

## What you hand back (run as the `architect` agent)

The plan lives in its file; your answer goes back into the main conversation and is re-sent on every call after it.
Hand back only, at most ~30 lines: the verdict with its conditions · the plan file path · one line per phase (its
service and what it delivers) · the main risks, one line each · the two questions below. Never paste the plan, the
options analysis or the self-criticism again — they are in the plan file.

## Second opinion and delegation

At the end, ask:

> Do you want an independent second opinion on this design before we treat it as settled? (y/n)

If yes, route it to a fresh-eyes reviewer per `.ai/routing.md`: hand over only the design summary
(proposal, options, risks, assumptions, verdict) — its value is that it has not seen this
conversation. Where the installation has more than one model, use a different one. Do not present
the verdict as closed until that response is incorporated, and **record which channel actually
reviewed it** in a `Notes` line of the ticket — never let "second opinion" be read as cross-model
review when a single model played both parts.

If the verdict is `APPROVABLE`, ask:

> Do I implement myself or delegate the execution? (me/delegate)

- **me** → the orchestrator session implements, following the plan phase by phase.
- **delegate** → one `executor` per service, in the delivery order, each with a **closed scope**
  (the phase's tasks, files and acceptance criteria). The result goes through `/reviewer` before
  continuing.

If the verdict is `NOT RECOMMENDED`, offer to record the negative decision as a
`Decision (YYYY-MM-DD):` line in the ticket's `Notes`, with the discarded proposal and the reason —
and, if it binds the whole project, to propose it for `.ai/CONTEXT.md` → Permanent decisions (its
own pull request). Only write it if the human confirms it.

The agent never runs `git commit` or `git push`, in any repository.


## Last line — NEXT
Run as a subagent (the task tool): no NEXT — the main session gives it after recording your report.
Run by the human as a command: when the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
