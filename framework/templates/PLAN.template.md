# Implementation plan — [Jira key] [Name]

<!-- Saved as .ai/plans/<Jira key>-plan.md by /architect, and referenced from the ticket file
     (.ai/tickets/<Jira key>/<Jira key>.md) by a "Decision (YYYY-MM-DD):" line in its Notes. -->

> **For agents:** read this ENTIRE plan before touching code. If you find `[NEEDS CLARIFICATION]`,
> stop and ask the human. **Forbidden** to leave vagueness: no `TBD`, `TODO`, "implement later",
> "fill in details", "add appropriate validation/error handling", "manage edge cases", nor
> "write tests" without the real test code. If a task cannot be described at this level, design is missing.

**Objective (1 sentence):** [what is being built and for what]
**Architecture (2-3 sentences):** [how it fits into the project]
**Services (in delivery order):** [`provider` → `consumer` → … — the services of the ticket's `services:`; a library before the services that pin it]
**Stack:** [Java X / framework / Maven build / DB / security — what is relevant for this plan]
**Branch:** `feature/[Jira key]` (in every service listed, and in the knowledge repo)   **Ticket:** `.ai/tickets/[Jira key].md` · **Spec:** [link]
**`/architect` verdict:** [APPROVABLE — link to analysis]

---

## 1. Verified context
- **REAL status checked** (with HOW it was checked): [e.g. "the endpoint is in `design-domain/rcd/…/X.java:40-90`, read"]
- **Contracts touched and their consumers** (`.ai/integrations.md`): [contract → consumers → what each one must do, or "none"]
- **Assumptions WITHOUT verification** (marked, to be confirmed before depending on them): `[ASSUMED]` ...
- **Hard restrictions:** [those that apply — from `.ai/orchestrator.md` and the `service.md` of each service: existing patterns, layers, security; the agent NEVER commits/pushes]

## 2. Design gate (fulfill before starting)
- [ ] **Simplicity:** is it the simplest solution that works? (yes/no + why)
- [ ] **Anti-abstraction:** is adding an unagreed-upon new framework/layer/dependency avoided?
- [ ] **Integration:** does it respect the project's existing patterns (layers, security, conventions)?
- [ ] **Boundary:** if a contract changes, is every consumer in `.ai/integrations.md` covered by a task below?
- [ ] **Reviewed by `/architect`:** [link to APPROVABLE verdict]

---

## Phase 0 — Investigation (read-only, WITHOUT changes)
- T001 — Locate [class/endpoint] and its callers. Files: `[service]/path/...`
- T002 [P] — Confirm the existing contract/signature in `[service]/path/...`
- **Phase output:** definitive list of files to touch, per service. **Gate:** no code yet.

## Phase 1 — Core changes ([service] — the provider first when several)
### T010 [task title — must be able to be done in 2-5 min]
- **Files:** create `[service]/path/New.java`; modify `[service]/path/Existing.java` (~lines 120-160)
- **Atomic steps:**
  - [ ] Failing test:
    ```java
    // real test code, not "write a test"
    ```
  - [ ] Verify the failure (`mvn test -Dtest=TestName`, bash tool `workdir` = `[service]`, what is expected to be seen)
  - [ ] Minimal implementation:
    ```java
    // real code
    ```
  - [ ] Verify that it passes (the service's gate, `workdir` = `[service]`)
- **Acceptance criteria:** [observable and verifiable, not "works well"]
- **Rollback:** [how to undo this task without side effects]

### T011 [P] [another task on different files → parallelizable]
...

## Phase 2 — Consumers / integration / polishing
- T020 — [the consumer services: client, listener or version bump; each one's gate green]
- T021 — [logging with project logger without secrets, error handling, response format, etc.]

---

## Dependencies and parallelism
- Phase 0 → Phase 1 (blocking) → Phase 2. Provider before consumers; library before its version bumps.
- `[P]` = task on different files and without dependencies → executable in parallel.

## Risks
- [risk] → [mitigation] → [early sign that it's going wrong]

## Necessary human validation
- The gate of EVERY service touched in green (`.ai/orchestrator.md` → Services).
- What only an environment can verify: the manual procedure in `.ai/CONTEXT.md` → Manual test procedures.
- `/reviewer` (+ `/security` if touching auth/SQL/endpoints) before closing.
- **Commit and push: ONLY the human**, one commit per repository. The agent never commits.

---

## Plan self-review (exit gate, before delivering it)
- [ ] Covers the entire incident/spec (without gaps) — in every service of the ticket.
- [ ] Zero placeholders (`TBD`/`TODO`/"appropriate"/"later") — scanned.
- [ ] Names/types/paths consistent between tasks; every path prefixed with its service folder.
- [ ] Each task has files, atomic steps, acceptance criterion, and rollback.
- [ ] Every consumer of a changed contract has a task.
