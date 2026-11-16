# CONTEXT — <Project>

> **Project-level context that changes rarely** — shared by the whole team, changed only through a
> pull request to `master` of the knowledge repo, and never as part of day-to-day ticket work.
>
> It is **not** a status file. The live state of each piece of work lives in its ticket file
> (`.ai/tickets/<Jira key>/<Jira key>.md`); the backlog lives in Jira; the history lives in the tickets'
> session logs and in `.ai/known-issues/`. Text such as "currently…", "in progress…" or "next step…"
> belongs in a ticket file, not here. The facts of a service (stack, modules, run
> commands) are not here either: `.ai/services/<name>/service.md`.
>
> Mandatory veracity labels: `[VERIFIED <date>]` (checked with command/output) · `[ASSUMED]` (read
> without verifying). Anything important without a label is treated as ASSUMED.
> Sections are referenced by name (e.g. "`.ai/CONTEXT.md` → Permanent decisions"), never by number.

---

## Permanent decisions
<!-- Add-only. Protected zones, "do not touch", architecture choices that bind every ticket.
     Each line: the decision · why · date · Jira key where it was taken (if any). Name the service. -->

- **Protected zones (do not touch without an approved `/architect` plan):** … (`<service>`: …)
- **Architecture decisions:** … (why, date, key)
- **Shared libraries — versioning policy:** snapshots or releases · who bumps the version in the
  consumers · when (`.ai/METHODOLOGY.md §10`)
- **Delivery order between services:** the default (provider before consumers, library before the
  services that pin it) and the documented exceptions

## Manual test procedures
<!-- Reusable procedures for what the agent CANNOT verify alone: real environments, third-party
     credentials (by role, never the values), and the integration between services — of this
     workspace, or with external ones. There is no build of the whole system, so this is where an
     integration is verified. Exact steps for a human. Ticket-specific checks go to the ticket's
     "Verification" instead. -->

- **<What it verifies> (<services involved>):** environment · preconditions · steps · expected result

## Technical data
<!-- Rewritten when it changes. What a new agent needs that belongs to no single service. The gate
     and base branch of each service are in the Services table of .ai/orchestrator.md. -->

- **Environments:** … (names and what each one is for — never credentials)
- **Jira project:** `<KEY>` · branches `feature/<Jira key>` in every repository, the knowledge repo included
- **Logs (GoJira / Loki):** container or service name of EACH service, as returned by
  `gojira_list_log_containers`
- **Known caveats:** … (things an agent would repeat without knowing — environment limits, denied
  commands, modules that build only from the IDE)
