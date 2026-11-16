# Procedure — closing a ticket: the checks that apply only sometimes

Read from `.ai/procedures/close.md` step 2 when the ticket is corrective (or has a `resolution`), a contract, an
event, a shared table or a library changed, a service or library outside the workspace is involved, or the ticket
is being abandoned. Each check is reported ✅ / ❌ with the others; a check whose condition does not hold is skipped.

| Check | Rule |
|---|---|
| Affected components | If a contract, an event, a shared table or a library changed: the provider's `context/api.md` and `.ai/integrations.md` updated, and the ticket lists the components possibly affected (`## Impact analysis`, or a `Notes` line for a corrective) — the human decides what to do with the list |
| Analysis | Corrective: `## Analysis` in the Jira format, effort confirmed — *has the human pasted it into Jira?* |
| Known issue | `resolution` ∈ code-defect, data-issue, configuration, external-system, works-as-designed → create `.ai/known-issues/<key>.md` from `.ai/templates/known-issue.template.md`, with its `services:`, its `skills:` (`node .ai/scripts/ai.mjs impact --files <its files> --skills-only`), its `## Files` with the methods, and a "Pattern to watch" naming the other places (consumers, services pinning the same library) — or, if the same issue already exists, add this key to its `related`, update `last_seen` and add a References line |
| Prior art recorded | `## Prior art` filled (`hit` / `none` / `irrelevant`) when an analysis was done |
| Outside the workspace | A service or library outside the workspace involved in the cause or the fix → tell the human the other team must be informed and the issue recorded in their knowledge base — by them, not by you |

**Abandoned** — `status: abandoned` with the reason in `## Closure`, never deleted; for uncommitted code, give the
human the exact per-service commands to restore or branch it, and record them there.
