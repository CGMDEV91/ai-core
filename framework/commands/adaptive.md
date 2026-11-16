---
description: An adaptive or development ticket end to end — intake, impact analysis with the components possibly affected, EUIPO validation when it applies, a persisted plan with the delivery order, implementation by phases per service with the gate at each one, fresh-context review, test instructions, closure. Usage — /adaptive <Jira key>
---

# /adaptive — a change request or a new capability

**When to use me**: a ticket of type `adaptive` (an existing behaviour must change: a rule, a field,
a validation, a contract) or `development` (a new capability: an endpoint, a flow, a module). A
refactor is an adaptive ticket whose `Boundaries` say "observable behaviour unchanged; existing
tests pass untouched" — the gate is then the existing tests, and the review question is "did
anything callers depend on change?".

**Invoke me with**: `/adaptive <Jira key>`. The key is mandatory.

## Steps

**1. Session start** — `.ai/procedures/start-session.md`. **2. Intake** — `.ai/procedures/intake.md`
(`type: adaptive | development`, asked in the one question; `services:` may start as `[]`; the Jira
text becomes `Intent`; a refactor is written into `Boundaries`). 🛑 Wait for the OK on the header.

**3. Prior art, briefly** — grep tool with an explicit path in `.ai/known-issues/` and `.ai/tickets/`
for the area (classes, endpoints, business terms), and the relevant `.ai/skills/` file if the area is
documented (`.ai/skills/README.md`). Record `## Prior art`. Known-issue "Pattern to watch" lines in
the area are design input, not trivia.

**4. Impact analysis** — `## Impact analysis`, in the ticket. The tools first, then your judgement on them:
`/touchpoints <term>` for every status, field, role or message the change adds or alters (every place it is wired,
in every service — the checklist of the change); `node .ai/scripts/ai.mjs impact --key <key> --files
<service>/<path>… [--methods Class.method]` for the files and methods the change will touch (the workflows,
known issues and past tickets on them — `--write-ticket <key>` writes the generated block into the section);
`node .ai/scripts/ai.mjs contracts` for the endpoints between services. Then:
- **Scope** — what changes, in which services (this sets `services:`; `Decision (date): services += …`
  for each one added, and their `service.md` read).
- **Contracts and resources touched** — endpoints, events, schemas, shared tables, libraries — and
  for each one, from `.ai/integrations.md`, the **components possibly affected**: every consumer of a
  touched contract, every service pinning a touched library, every reader of a touched table. One
  line each: what it is, why it may be affected. This list is the deliverable of this step; the human
  decides what to do with each item (change it in this ticket, check it, or leave it).
- **Risks** — security, data, deployment, operation, rollback.
- **Delivery order** — provider before consumers; a library release before the version bumps of the
  services that pin it; exceptions and why.
- **Estimated effort** — `<to confirm>` until the developer gives the figure. 🛑 Wait for it.

If EUIPO must validate the impact analysis before implementation (the human says so): `status:
waiting-validation`, `Current state` = "Impact analysis delivered on <date>, waiting for EUIPO
validation. Next: on approval, plan." — `end-session.md`, paste into Jira,
`git -C .ai add tickets/<key>/` (by path), commit, push, pull request to `master`; the ticket stays
open and `/adaptive <key>` resumes it after the merge (`git -C .ai switch -C feature/<key>` from the
updated `master` only once the MR shows *Merged*).

**5. Plan.** ≤3 files in one service, no contract, no DB/security/deployment → no plan: implement
directly. Anything larger → `.ai/commands/architect.md` with the `architect` agent (task tool, fresh
context, only the key): options including *not doing it*, self-criticism, verdict, and — if
APPROVABLE — `.ai/plans/<key>-plan.md` with phases per service in the delivery order and a task for
every component the impact analysis marked as "change it in this ticket". Without a task tool,
follow `architect.md` yourself and say so in `Notes`. 🛑 **The human approves the plan** and answers
*implement myself or delegate?*

**6. Implement by phases, not all at once.** Several developers on the ticket: each phase has one owner in the
plan (`### Phase 2 · <service> (<username>)`); each works in their own diary and never takes another's phase. Phases of at most 2–3 files, grouped by layer or module
and, across services, by service in the delivery order. Each phase: implement (delegated → one
`executor` per service with a closed scope; kept → in this session) → `gate.md` (the phase's tests,
then that service's full gate at the end of the phase) → the next phase. A phase is not closed
until its gate is green; no debt carried over. 🛑 After 3 iterations without green in a phase, or
when a later phase reveals the design does not fit: stop, back to the plan with the human — no
patches on top of a design that does not fit. For `development`, before the first phase: *is this
the right solution; is there a simpler one; what am I assuming about the requirements?*

**7. Review** — `.ai/procedures/review.md`: `reviewer` subagent with the key; `security` when auth,
SQL, sensitive data or an endpoint is touched (always for a new endpoint); `tester` for new logic
without tests. A refactor adds the question: public signatures, routes, response schemas, exception
types, SQL results unchanged? 🛑 The verdict goes to the human.

**8. Knowledge and test instructions.** Before the review: `node .ai/scripts/ai.mjs impact --key <key>` on the
real change (the plan's files were a forecast). `## Changes` per service; the staleness tables of
`.ai/orchestrator.md` and of each touched service's `service.md` — the provider's `context/api.md`
and `.ai/integrations.md` for every contract or event changed, `data-model.md` for entities, the
relevant skill for a business rule (or propose a new one per `.ai/procedures/skills.md`);
`## Test instructions` in the Jira format; a lesson worth keeping → offer `/learning`.

**9. Close** — `.ai/procedures/close.md`. Not finishing today → `end-session.md`, with `Next:` at the
phase to resume.

## Definition of Done (adaptive / development)

Impact analysis with the components possibly affected, effort confirmed, validated by EUIPO when it
applied · plan approved when one was needed · every phase green, the full gate of every service
touched green with evidence · the touched flows exercised for real where the service runs locally ·
zero secrets, `System.out` or concatenated SQL · `## Changes` and the staleness updates done (a
changed contract documented by its provider and mapped in `integrations.md`) · review verdict in
`Notes`, human review for auth/SQL/contracts/data model · test instructions pasted into Jira by the
human. One commit message per repository touched; the agent commits nothing, anywhere.


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
