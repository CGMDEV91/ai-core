---
description: The fix of a corrective ticket — resumes the analysed ticket (or takes the developer's diagnosis), plans when needed, writes the regression test red-then-green, runs the gate per service, reviews with a fresh context, drafts the Jira test instructions and closes. Usage — /bugfix <Jira key>
---

# /bugfix — a confirmed defect, fixed

**When to use me**: a corrective ticket whose analysis is done (`resolution: code-defect`, validated
by EUIPO when that applied) — or a bug the developer has already diagnosed and wants fixed without
a formal `/analysis` first. A hotfix on a release branch is the same command with a target branch.

**Invoke me with**: `/bugfix <Jira key>`. The key is mandatory.

## Steps

**1. Session start** — `.ai/procedures/start-session.md`. **2. Intake** — `.ai/procedures/intake.md`
(`type: corrective`). Then:
- The ticket has `resolution: code-defect` and an `## Analysis` → continue from its Proposed Solution.
- The ticket exists without an analysis, or does not exist → ask the human for the diagnosis and the
  fix they want, in the same intake question; record
  `Decision (date): fix without /analysis — <the diagnosis, in your words>`. If what they describe
  is not actually diagnosed ("something in the client"), say that `/analysis` comes first.
- The fix targets a branch other than the service's base (a hotfix on a release branch): record it
  in `base:` — `start-session.md` and the reviewer use it.
🛑 Wait for the OK on the header.

**3. Plan — when the fix is not small.** Thresholds: ≤10 lines in one file → no plan, fix directly
(the orchestrator's own microfix); otherwise, **2+ files, 2+ services, or anything touching DB,
API/contracts, security or deployment** → run `.ai/commands/architect.md` with the `architect` agent
(task tool, fresh context), giving it only the ticket key: it reads the ticket, the `service.md` of
the listed services, the integrations row of any contract involved and the known issues' "Pattern
to watch", and writes `.ai/plans/<key>-plan.md` — with the delivery order when several services
change (provider before consumers, a library before the services that pin it). Without a task tool,
follow `architect.md` yourself and say so in `Notes`. 🛑 **The human approves the plan**, and
answers *implement myself or delegate?*

**4. Implement — in the service at fault, minimum change.**
1. `gate.md` → the full gate of the service once, before touching anything (the starting point).
2. **The regression test first**: a test that reproduces the defect, run with `workdir` = the service
   → **red**, the failing assertion recorded as evidence in `## Verification`. If it cannot be
   automated, say why and describe the manual check (reusable → `.ai/CONTEXT.md` → Manual test
   procedures).
3. **The fix**: the minimum change that resolves the root cause, not the symptom; no refactoring
   around it. Delegated → the `executor` agent with a closed scope: service, files, the test that must
   go green, nothing else; one executor per service, in the delivery order. Kept → in this session,
   per the plan.
4. `gate.md` → the test green, then `node .ai/scripts/ai.mjs gate` (NEW findings only — the pre-existing ones are
   not this ticket's) and the full gate of the service; a changed contract or library → the gate of every
   consumer changed in this ticket as well.
5. Self-criticism before going on: superficial patch or root cause? other flows of this service?
   other services (a contract, a shared library) — the **components possibly affected** listed in
   `Notes`?

**5. Review** — `.ai/procedures/review.md`: the `reviewer` subagent with the key (and `base:` if
set); `security` when auth, SQL, sensitive data or an endpoint is touched; `tester` when logic was
added without tests. 🛑 The verdict goes to the human; CRITICAL → fix, gate, review again (max 2).

**6. Knowledge and test instructions.**
- `## Changes`: one line per file per service, then the knowledge files touched.
- The staleness tables: `.ai/orchestrator.md` (system level) and each touched service's
  `service.md` — `context/` files, `.ai/integrations.md` when a contract or event changed, the
  relevant skill when a business rule changed. In this ticket, not later.
- `## Test instructions` in the format of `.ai/templates/jira-test-instructions.template.md`, for the
  developer to paste into Jira.
- A lesson worth keeping (a restriction nobody had written, a surprising behaviour of the stack) →
  offer `/learning`. A business rule this fix changes or reveals goes to its skill at close
  (`close.md` step 1 — the skill holds the rules in force; the ticket keeps a reference).

**7. Close** — `.ai/procedures/close.md` (which starts with `end-session.md`). Not finishing today →
`end-session.md` alone, with `Next:` pointing at the step to resume.

## Definition of Done (code-defect)

Root cause confirmed · regression test red-then-green · the full gate of every service touched green
with evidence · the touched flow exercised for real where the service runs locally · zero secrets,
`System.out` or concatenated SQL · `## Changes` and the staleness updates done · review verdict in
`Notes`, human review for auth/SQL/contracts/data model · test instructions and analysis pasted
into Jira by the human · known issue written at close. One commit message per repository touched;
the agent commits nothing, anywhere.


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
