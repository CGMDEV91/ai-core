# Reviewer — code review before commit or merge

Act as a Staff Engineer reviewer for this project. Hunt structural errors, violations of the
methodology or of the project's own architecture, and risks — **before** code reaches the repo.

For a design not yet implemented, this is the wrong command: use `/architect`.

> **You may be running with an empty context.** This procedure is normally run by a subagent that
> has not seen the conversation that produced the code — that is the point (`.ai/routing.md`:
> context isolation is what independence means when a single model plays every role). So do not
> expect the diff, the task description or the design rationale to be in your context. Get them.

## Step 0 — Obtain the change yourself

You run in the **workspace**: the working directory holds `.ai/` (the knowledge base) and the code
of each service as a sibling folder with a git repository of its own (`.ai/METHODOLOGY.md §9`). The
stub injects the knowledge repo's branch (the ticket key is in it) and your arguments. Then:

1. **Which ticket, which services?** The key from the argument, else from the branch
   (`feature/<key>`). Read the ticket's front matter (`.ai/tickets/<key>/<key>.md`): `services:` is the
   list of repos the ticket may touch; `base:` any target branch that is not the table's;
   `baseline:` the HEAD each service started from. A service name passed as argument narrows the
   findings to that service — the check for stray changes elsewhere still runs.
2. **One diff per listed service**, with the bash tool's `workdir` set to that service's folder
   (`git -C` is usually denied by policy): `git status --short`, `git diff` (plus `git diff --staged`
   if anything is staged); for a branch with several commits, `git diff <base>...HEAD` with the
   service's base branch (`base:` override, else `.ai/orchestrator.md` → Services);
   `git log --oneline -5` for what came just before.
3. **Any other service with changes?** `git status --short` with `workdir` set to each service of
   the Services table that the ticket does NOT list. A diff there is a finding (Step 2 → Boundaries).
4. **The documentation.** Do not run `git status` on the knowledge repo — what is committed there
   is the developer's business. Read the ticket file instead: `## Changes` names the knowledge files
   this ticket updated; read them (`.ai/services/<name>/context/api.md`, `.ai/integrations.md`,
   the known issue…) and check they reflect the diff. `## Changes` empty, or silent about a file the
   staleness tables require → a finding. If you cannot read the ticket file, the documentation
   items of the checklist are **not performed** — say so.

5. **The scope of this round** — `node .ai/scripts/ai.mjs review state <key>` (read-only): **FULL** (first round:
   every file, the whole checklist), **INCREMENTAL** (verify the open findings of `## Review`, then review only the
   files whose hash changed since the last round — a new finding only on changed lines, or a CRITICAL in
   security), or **STOP** (two rounds done: report the open findings for the human to decide; do not review
   again). `node .ai/scripts/ai.mjs review digest <key>` gives the ticket in ≤ ~80 lines (intent, boundaries, every
   developer's changes, decisions, open findings) when the ticket is long.
6. **What the change takes part in** — `node .ai/scripts/ai.mjs impact --key <key>`: the workflows (skills), known
   issues and past tickets on the same files and **methods**. Each ⚠ flow is checked against its skill's rules;
   each known issue's *Pattern to watch* against the diff.

**Never review from a description of the change.** If you cannot obtain a service's diff, say so
and stop for that service. Reviewing an imagined diff is worse than not reviewing: it produces a
verdict with no basis and the human will trust it.

## Step 1 — Project context (read-only)

1. `.ai/orchestrator.md` — the system: conventions common to every service, **Known Gotchas
   (system-wide)**, the Services table (base branch and gate of each service in the diff). It is already in your
   instructions, with `.ai/non-negotiables.md` and `.ai/rules/*.md`: apply them, do not read them again — only if
   you do not see them in your instructions (another tool, a wiring without them), read them.
2. `.ai/services/<name>/service.md` of **each service in the diff** — its architecture rules,
   specific restrictions and **Known Gotchas**.
3. `.ai/known-issues/` — their "Pattern to watch" lines (grep tool with that explicit path, by the
   classes, endpoints, topics and modules in the diff — any service of the workspace). **Any
   "Pattern to watch" that reappears in this diff is 🚨 CRITICAL**: a known, already-fixed pattern
   coming back is the highest-value finding in this file.
4. If the change touches a documented business workflow, the relevant `.ai/skills/` file — review
   against its business rules, not only against code quality.
5. If the diff touches a contract — an endpoint signature, a JSON/Avro schema, an event, a library's
   public API — `.ai/integrations.md`: who consumes it.
6. `.ai/rules/` — the hard rules that produce the checklist below (already in your instructions) — and
   `.ai/rules/stacks/<stack>.md` for each service in the diff whose stack has one (Drupal, React): read it, its items
   join the checklist.
7. `.ai/CONTEXT.md` → *Permanent decisions*: the protected zones the diff must not touch.

## Step 2 — The checklist (work through it item by item)

Closed list, not open impressions. Open-ended judgement is the failure mode of same-model review.

**Security / data**
- [ ] SQL: no query built by concatenating input. Parameters, not interpolation — including
      dynamic `ORDER BY` / optional filters (structure by whitelist, **values always as parameters**).
- [ ] No secrets, tokens, passwords or PII logged, printed or put in exception messages — at any level.
- [ ] Client input (headers, body, params, token claims) validated server-side before use.
- [ ] New endpoint → access control explicitly defined. Secure by default, not open by default.
- [ ] No credentials hardcoded; no new credential/role asking for more scope than it needs.

**Code / architecture**
- [ ] Layer rules respected: business logic in the service, never in the controller.
- [ ] Project logger used — no `System.out`.
- [ ] No `.get()` on an `Optional` without checking presence; no unchecked casts; no assuming a
      collection or map is non-empty and non-null.
- [ ] No magic numbers or repeated string literals — named constants.
- [ ] No new dependency without justification; language level within what the service declares.
- [ ] Follows the module's existing patterns (naming, exception handling, DTO vs entity) and the
      service's own restrictions (`service.md`).
- [ ] Minimum change, one concern in the diff — no unrelated refactoring smuggled in. A refactor
      ticket (`Boundaries`: behaviour unchanged): no public signature, route, response schema,
      exception type or SQL result changed.

**Drupal services** (only when the diff has one — `.ai/rules/stacks/drupal.md`)
- [ ] Every new or changed hook, interface method or event subscriber matches the installed signature
      (`node .ai/scripts/ai.mjs where <hook> --kind hook`; the gate's `api-signatures` row). Never trust the plan's.
- [ ] Services injected and registered in `<module>.services.yml`; access decided in an access hook or subscriber,
      not inline; strings through `t()`.
- [ ] Configuration exported (`drush config:export`), not hand-written: a new field has storage, instance and both displays;
      `config:status` clean in the gate.

**Correctness / tests**
- [ ] Edge cases handled: null, empty, boundary, duplicate, concurrent where applicable.
- [ ] A logic bug fix comes with a regression test, and the ticket's `## Verification` shows it
      **red before the fix** (the failing assertion as evidence). You cannot run tests: if that line
      is missing, mark the item *unconfirmed* — never tick it from reading the test.
- [ ] Existing tests were not weakened or deleted to make the change pass.

**Boundaries between services**
- [ ] Every service with a diff is listed in the ticket's `services:`. A diff in an unlisted
      service → ⚠️ IMPORTANT: the ticket must be updated (and that service's `service.md` read)
      before the change is accepted.
- [ ] A changed contract, event, shared table or library: the provider's `context/api.md` and
      `.ai/integrations.md` updated, and the ticket **lists the components possibly affected**
      (`## Impact analysis`, or a `Notes` line for a corrective) — the consumers from
      `integrations.md` are all named. A changed contract with no such list → 🚨 CRITICAL; a list
      that misses a consumer you can see in `integrations.md` → 🚨 CRITICAL.

**Process**
- [ ] Documentation (Step 0.4): `## Changes` filled; the gate's receipt in the diaries (`## Receipts`,
      `exit 0 · "RESULT: PASS"`, after the last edit); `## Verification` with evidence lines for the other checks
      (`[VERIFIED … — "…"]`, never a bare label); the known issue present when a corrective ticket
      is closing with a resolution that requires one; every `context/` or `integrations.md` update
      the staleness tables require for this diff. Missing → ⚠️ IMPORTANT.
- [ ] No AI file added to a service — run, per service in the diff, with `workdir`:
      `git status --short` and look for `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, `opencode.json`,
      `.opencode/`, `.ai/`, `.claude/`, notes or plans. Present → 🚨 CRITICAL.
- [ ] Nothing committed or pushed by the agent, in any repository.

## Step 3 — Impacts (state them explicitly, even if none)

Does the diff touch **DB** (schema, DDL, complex queries) · **API / contracts** (endpoint
signatures, JSON/Avro schemas, events — and which consumers, from `.ai/integrations.md`) ·
**Security** (auth, sessions, sensitive data) · **Deployment/Infra** (Dockerfiles, pipelines,
configs) · **Delivery order** (does a consumer need the provider deployed first?) · **Knowledge
base** (documented behaviour now stale)?

## Step 4 — Classify the findings

**🚨 CRITICAL (must fix)** — logic bugs or unhandled edge cases · violation of a non-negotiable
architecture rule · security risk (injection, secrets, open auth) · broken build or failing tests ·
a known issue's "Pattern to watch" resurfacing · a changed contract with no list of affected
components, or one that misses a known consumer.

**⚠️ IMPORTANT (should fix)** — missing error handling or logging · missing tests for new logic ·
avoidable complexity · inconsistent naming or pattern · stale documentation · a service touched
that the ticket does not list · a `[VERIFIED]` without evidence.

**💡 SUGGESTION (optional)** — style, more idiomatic alternatives, doc improvements.

## Step 5 — Report — short, in this shape and nothing else

Your report goes back into the main conversation and is re-sent on every call after it: no account of the commands
you ran or of the files you read, no diff quoted beyond the offending line, no `Files reviewed:` hashes (the main
session has them from `review state`). At most ~60 lines.

```
Verdict: APPROVED | APPROVED WITH SUGGESTIONS | REQUEST CHANGES — Round <n> · <date> · full | incremental
Reviewed: <service>: <n> files (<base>…HEAD | working tree) · <service>: … · not obtained: <service — why>
Impacts: DB · API/contracts · Security · Deployment · Delivery order · Knowledge base — the ones that apply, or none
| ID | Sev | Where | Finding | Status | Round |
|---|---|---|---|---|---|
| R<n> | CRITICAL | <service>/<path>:<line> | <what is wrong> — `<the offending code>` → <the fix> | open | <round> |
Clean: <the checklist items verified with no problem, comma-separated>
Unconfirmed: <a suspicion and the evidence that would settle it> (or omit the line)
Independence: <channel>; same model as the author: context isolation, not model diversity.<human review recommended: auth / SQL / public contract / data model — when it applies>
```

The table rows are ready for the ticket's `## Review` (ids continuing from the last one). An incremental round marks
each open finding `fixed` (quote the line) or keeps it `open`. **Never approve with an empty `Clean:` line** — silence is
not evidence of checking; "looks good" with no enumeration is a failed review. Do not fix what you find: report it.
Never run `git commit` or `git push`.

## Last line — NEXT
Run as a subagent (the task tool): no NEXT — the main session gives it after recording your report.
Run by the human as `/reviewer`: when the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
