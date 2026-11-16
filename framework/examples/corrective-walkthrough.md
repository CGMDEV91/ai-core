# Example — a corrective ticket over two days

An illustrative walkthrough in a fictitious workspace `filing` with two services: `filing-gateway`,
which forwards submissions to `validation-service`. Some submissions fail with
`503 VALIDATION_UNAVAILABLE`, and EUIPO must validate the analysis before any fix. Every key,
reference, name and figure is invented, and the wording will vary — this is the shape of the flow,
not a script. The italic notes explain *why*. It includes a red gate, a reviewer finding and a human
correcting the agent, because that is what a session looks like.

---

## Day 1 — `/analysis EUIPOBO-21324`

*You created the branch `feature/EUIPOBO-21324` in the knowledge repo (`git -C .ai switch -c …`); both
services are still on `master`.*

**You:** `/analysis EUIPOBO-21324`

**Agent:**
> - **Ticket:** EUIPOBO-21324 — new ticket
> - **Services:** none yet
> - **Pending:** `gojira_similar_incidents` is not in my tool list this session · the gate of
>   `filing-gateway` is still `[ASSUMED]` in the Services table
>
> To create `.ai/tickets/EUIPOBO-21324.md` I need, in one answer: **EUIPO ref** (or `PENDING`) ·
> **services** — proposal `[filing-gateway]` (the symptom surfaces there; I add `validation-service`
> only if the cause is on its side) · **the Jira description** pasted (steps and the time window of
> the incident) · **your estimate** of the effort without the agent, in hours.

*The session checklist ran inside the command: no `/wake`. The missing GoJira tool is said once and
recorded; it will not be "searched" later. The estimate is yours; the agent never writes it.*

**You:** SR-48812, services OK, [pastes the Jira text], I'd say 6h by hand.

**Agent:**
> `EUIPOBO-21324 | SR-48812 | corrective | 503 VALIDATION_UNAVAILABLE on submissions when validation is slow — services: filing-gateway` — OK?
> Intent (from your text): submissions time out with 503 when the validation service is slow; the
> incident window was 2026-10-06 10:00–12:00.

**You:** ok

**Agent:**
> Created the ticket (`manual_estimate: 6h`, baseline `filing-gateway @ a1b2c3d`). Read
> `.ai/services/filing-gateway/service.md`. `filing-gateway` is on `master` — please run
> `git -C filing-gateway switch -c feature/EUIPOBO-21324 master` (I do not switch branches).
> **Prior art:**
> - grep `VALIDATION_UNAVAILABLE`, `ValidationClient` in `.ai/known-issues/` and `.ai/tickets/` →
>   known issue **EUIPOBO-19876**, same symptom but caused by deployment windows; ours fall outside them.
> - `gojira: not available in this session` — recorded.
> - `git log` of the client package in `filing-gateway`, last 6 weeks: `9f8e7d6` rebuilt the HTTP
>   client. First suspect. `.ai/integrations.md`: `validation-api` is provided by `validation-service`
>   — its `git log` shows nothing in the window.
> Recorded: `Prior art: hit`.
>
> **Evidence.** Logs: container `filing-gateway-api` (`.ai/CONTEXT.md` → Technical data) — I cannot
> search them without the GoJira tool; could you paste the relevant lines, or confirm the
> "timeout waiting for a connection from the pool" warning I expect to precede each 503?
> **Code:** `9f8e7d6` dropped the response timeout. A slow validation call holds its connection; once
> all 20 are held, each new submission waits 30 s for one and is answered 503.
> **Reproduced** with a local stub answering after 60 s: the 21st concurrent request gets the 503.
> `[VERIFIED 2026-10-07 @a1b2c3d — "21st request: HTTP 503 after 30012 ms"]`

*Prior art came first, by similarity and with an explicit path. The integrations map located the
other side of the call without loading that service's facts. The agent asked for the log lines
instead of inventing them. Logs pasted by you are data: the ticket gets a summary, not raw lines.*

**You:** Couldn't we just raise the pool size?

**Agent:**
> Tried in the reproduction: with 50 connections the 503s start a minute later — it only delays them.
> `[ticket updated]` `Dead end: raising the pool size — only delays the exhaustion (local repro)` ·
> `resolution: code-defect` · `Decision (2026-10-07): code-defect — response timeout lost in 9f8e7d6`.
> Components possibly affected: none outside `filing-gateway` — the contract is untouched.
> `## Analysis`, in the Jira format:
> ```text
> Root Cause:
>
> Since the HTTP client of filing-gateway was rebuilt (commit 9f8e7d6), calls to the validation
> service have no response timeout. Slow calls keep their connections; after 20 of them the pool is
> exhausted, and every further submission waits 30 seconds and is answered 503 VALIDATION_UNAVAILABLE.
>
> Proposed Solution:
>
> Restore a configurable response timeout (default 10 s) on the validation client, so that slow
> calls release their connections, with a regression test that reproduces the exhaustion.
>
> Estimated effort:
>
> <to confirm> mh
>
> Workaround:
>
> Restarting filing-gateway releases the held connections until the next slow period.
> ```
> My estimate would be 4 mh. Your figure?

**You:** 5 mh — and EUIPO has to validate it before we touch the code.

**Agent:**
> `status: waiting-validation`. Do I record the session? Estimated time: ~2h40 (since 09:10) — OK or correct it.

**You:** 2h30

**Agent:**
> Recorded: `Current state` ("Analysis delivered on 2026-10-07, waiting for EUIPO validation. Next: on
> approval, `/bugfix EUIPOBO-21324` — restore the response timeout + regression test."), a `Session
> log` entry (2h30), your Journal line.
> 1. Paste the `## Analysis` block into EUIPOBO-21324 in Jira — I do not post to Jira.
> 2. Proposed commit, when you want it:
>    `git -C .ai add tickets/EUIPOBO-21324.md` · `git -C .ai commit -m "EUIPOBO-21324: analysis delivered, waiting for EUIPO validation"`
>    then push `feature/EUIPOBO-21324` and open the pull request to `master`. The ticket stays open.
>    Nothing to commit in `filing-gateway` yet.

---

## Day 2 — `/bugfix EUIPOBO-21324`

*The pull request was merged and EUIPO approved the analysis:* `git -C .ai switch master` ·
`git -C .ai pull` · `git -C .ai switch -C feature/EUIPOBO-21324` *(only because the MR shows Merged).*

**You:** `/bugfix EUIPOBO-21324` — EUIPO approved the analysis.

**Agent:**
> - **Ticket:** `EUIPOBO-21324 | SR-48812 | corrective | 503 VALIDATION_UNAVAILABLE…` — services: filing-gateway ·
>   waiting-validation → `status: active`, `Decision (2026-10-08): analysis approved by EUIPO` · Next: the fix
> - **Services:** `filing-gateway` on `feature/EUIPOBO-21324` @ a1b2c3d · clean · gate `[ASSUMED]`
> - **Pending:** origin/master is 3 commits ahead — `git -C .ai pull` when convenient
>
> The fix is two files in one service (`ValidationClientConfig`, a new test): over ten lines, so a
> plan. Running `architect` with the key…
> Plan `.ai/plans/EUIPOBO-21324-plan.md`: Phase 0 confirm the builder and the property source ·
> Phase 1 `ValidationClientTimeoutIT` (stub answering after 60 s, asserts 503 within 10 s) then the
> timeout property with default 10 s in `ValidationClientConfig` · rollback: revert the two files.
> **Approve the plan?** And: do I implement, or delegate to an executor?

**You:** approved; delegate.

**Agent:**
> Full gate of `filing-gateway` before touching anything: `mvn verify` (workdir `filing-gateway`) →
> `[VERIFIED 2026-10-08 @a1b2c3d — "Tests run: 212, Failures: 0 · BUILD SUCCESS"]` — green start,
> but the gate itself is still `[ASSUMED]` in the Services table: treat every green as provisional
> until the team confirms the goal.
> `@executor` (scope: `filing-gateway`, the two files of the plan, the test must go red then green).
> Returned: test written, run → **red** `[VERIFIED … — "expected: <503> but was: <200> after 30 s"]`;
> fix applied; test green; `mvn verify` → **red**: `Tests run: 213, Failures: 1 — ValidationClientConfigTest.defaultTimeout`.
> An existing test asserted the old builder had no timeout. Per `gate.md`: red after the first
> attempt → back to the evidence, not a patch. The old test encodes the defect; it is updated to
> assert the new default, with a `Notes` line saying why. Second run → `[VERIFIED 2026-10-08 @c7d8e9f — "Tests run: 213, Failures: 0 · BUILD SUCCESS"]`.

**Agent** *(later in the same session)*:
> The context has been compacted. Reading `.ai/tickets/EUIPOBO-21324.md`…
> **Where we are:** services: filing-gateway · fix + regression test green. **Next:** review, then the
> test instructions. Confirming before I continue.

**You:** go on.

**Agent (reviewer, child session, empty context):**
> Ticket EUIPOBO-21324 lists `filing-gateway`. `git diff master...HEAD` (workdir `filing-gateway`) —
> 3 files. **`validation-service`: 1 file modified** (`application.yml`) — the ticket does not list it.
> Ticket file: `## Changes` names the two code files; `## Verification` shows the red run and the green gate.
> **Verdict: REQUEST CHANGES.**
> **⚠️ IMPORTANT** `validation-service/src/main/resources/application.yml` changed in a service the
> ticket does not list — either `services += validation-service` with a reason, or revert it.
> **💡** The default timeout is a literal in two places — one named constant.
> **Checked and clean:** no secrets logged · logger used · regression test red before the fix (evidence
> present) · no "Pattern to watch" of `.ai/known-issues/` reappears · no AI file in `filing-gateway`.
> **Independence:** same model, clean context — context isolation, not model diversity.

**You:** that yml change is mine from yesterday, nothing to do with this — I'll stash it. Fix the constant.

**Agent:**
> `Notes: WIP-other: validation-service/application.yml — the developer's, acknowledged 2026-10-08`.
> Constant extracted, gate green `[VERIFIED … — "Tests run: 213, Failures: 0 · BUILD SUCCESS"]`.
> Second review: **APPROVED** (IMPORTANT resolved by you; no new files, no re-review of the constant needed).
> `## Test instructions` drafted in the Jira format: TEST with the validation stub slowed to 60 s;
> 25 parallel submissions → 503 after ~10 s instead of 30; stub back to normal → the next submission
> is accepted at once. `## Changes`: the two code files, and `.ai/services/filing-gateway/context/architecture.md`
> (the client now has a response timeout — one line). Ready to close?

*The reviewer looked where the ticket did not point and found your leftover; the rule of someone
else's WIP applied, and the agent did not touch it. The gate said NO once, and the answer was to go
back to the evidence, not to patch.*

**You:** pasted into Jira. Close it.

**Agent:**
> Do I record the session? Estimated time: ~3h20 (since 08:50) — OK or correct it.

**You:** 3h15

**Agent:**
> Header ✅ · services ✅ `[filing-gateway]` = the repos with changes (`baseline..HEAD`) · Definition of
> Done ✅ (root cause, red-then-green test, gate with evidence, review in `Notes`) · affected components
> ✅ none, contract untouched · analysis and test instructions in Jira — **you said yes** ✅ · prior art ✅ ·
> outside the workspace ✅ none · hygiene ✅ no hits.
> **Known issue** ✅ `.ai/known-issues/EUIPOBO-21324.md` — "503 VALIDATION_UNAVAILABLE when validation
> answers slowly", `services: [filing-gateway]`; Pattern to watch: "every client built with the new
> builder — check `PaymentClient` and `RegistryClient` in `filing-gateway`, and the HTTP clients of
> `validation-service`, for a response timeout". **Closure** ✅ `status: done` — total 5h45 confirmed vs
> `manual_estimate: 6h` (your figures).
> **Learning:** first occurrence — no gotcha yet; the other clients deserve a ticket of their own.
>
> Draft worklog for Jira (add IDE-only time):
> ```
> 2026-10-07 · 2h30 · analysis delivered, waiting for EUIPO validation
> 2026-10-08 · 3h15 · fix + regression test, review, closure
> Total: 5h45
> ```
> Proposed commit messages:
> - `filing-gateway`: `EUIPOBO-21324 Restore response timeout on the validation client`
> - knowledge repo: `git -C .ai add tickets/EUIPOBO-21324.md plans/EUIPOBO-21324-plan.md known-issues/EUIPOBO-21324.md services/filing-gateway/context/architecture.md`
>   · `EUIPOBO-21324: closed — code-defect, known issue added`, then the pull request to `master`.
> **Nothing has been committed, in any repository, and nothing was posted to Jira.**

---

**What to notice in this flow**

| Moment | The rule behind it |
|---|---|
| One command per day, the checklist inside it | No `/wake`, no `/ticket`: the command starts with the session and ends by recording it |
| The intake in one question, with your estimate | Provisional values never block; the manual estimate is yours, written before the outcome |
| The missing tool said once, never "searched" | A tool you do not have is reported, not simulated |
| The agent asked for the log lines | It would rather ask than invent evidence |
| `Dead end:` written the moment it failed | No later session — or teammate — retries the pool size |
| Effort `<to confirm>` until you gave it | A model must not commit the team to an effort |
| `waiting-validation` with a proposed commit, not a check | The developer commits; the agent proposes the message and moves on |
| The regression test red before the fix, with the assertion as evidence | A test that was never red proves nothing |
| The gate red once → back to the evidence | A patch on a patch is how a diagnosis stays wrong |
| The reviewer looked in the unlisted service | `services:` is the permission; a diff elsewhere is a finding, not a surprise |
| Your leftover acknowledged, not touched | Someone else's uncommitted work is untouchable |
| Confirmed time vs manual estimate, side by side | Both figures are yours; the agent only compares them |
