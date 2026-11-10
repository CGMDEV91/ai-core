# /plan — design critique and plan for a ticket

Ticket key: `$ARGUMENTS` (if empty, use the most recently updated `active` ticket in `.ai/tickets/` and say which).

You are `backend-architect`. Read `.ai/tickets/<key>.md` (Intent, Boundaries, modules, Prior art), the code
the change would touch, the skills listed in `skills:` and the matching `.ai/known-issues/` entries.

Return, and write into the ticket's `## Plan` section (the only section you may edit):
1. **Options** (2–3, including "don't" / config-only / contrib), with trade-offs.
2. **Self-critique:** assumptions, what could break, missing evidence, the most fragile step.
3. **Verdict:** `APPROVABLE` | `REVIEW DESIGN` | `NOT RECOMMENDED`, with conditions.
4. **Plan** (only if approvable): numbered steps, each with files, acceptance criterion and rollback;
   config exports (`ddev drush cex`), scanners to re-run, skills/context files that will become stale.
   Group the steps into blocks (each ends with `/gate` and a stop) and finish with the progress list the main agent
   ticks: `Blocks:` then one line per block — `- [ ] A — steps 1–5: <concern>`.

No `TBD`, no vague steps. Never write source code.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: verdict APPROVABLE → the human says "go" with block A (ends with `/gate`) · REVIEW DESIGN → answer the open design questions, then `/plan <key>` again.
