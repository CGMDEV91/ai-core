---
description: Captures cases and design decisions. Permanent gotchas go to the service's service.md (or to .ai/orchestrator.md when they span services). Global rules are instructed for manual editing. Specific cases go to .ai/proposals/. Business knowledge goes to .ai/skills/, bug patterns to the known issue's "Pattern to watch".
---

# Learning — Knowledge Capturer

**When to use me**:
- "Note this as a learning"
- "Gather this for the future"
- Automatically when you detect:
  - A bug that took more than 30 min to diagnose
  - A project case that was not documented
  - A design decision that was made and must be remembered
  - A surprising behavior of a service's stack or framework
  - A restriction that was not in the service's `service.md` (or in `.ai/orchestrator.md`) and should be
  - A business rule that was discovered in code/conversation and is written nowhere

**Invoke me with**: `/learning` · `/learning <Jira key>` (a skill from what that ticket taught) · or
`/learning promote` for promotion mode.

## A skill from a ticket — `/learning <key>` (or right after a close)

Before proposing anything, read the ticket's `## Knowledge` (`.ai/tickets/<key>/<key>.md`; no key given → the ticket
closed last) and the three criteria of `.ai/procedures/skills.md`:

- **The close recorded `no skill: <why>`** → say it first, then give your own view on the criteria, and ask:
  ```
  At the close of <key> a skill was judged not needed: <why>.
  My view: Recurrence yes|no (<evidence>) · Specialisation yes|no (<rule>) · Payoff yes|no (<what it saves>)
  → <I agree it is not needed | I would create it, because …>
  Create it anyway? (yes → I propose title, scope and key files · no → nothing changes)
  ```
  Nothing is written before the human's yes. On yes: `.ai/procedures/skills.md` (create, link both ways); then replace the ticket's `no skill` line in
  `## Knowledge` with `<skill file name> — created from this ticket: <rule in one line>`, and add it to the ticket's
  `skills:`. What the skill now holds (the rule, the edge cases worked out in `## Analysis` or `Notes`) is removed
  from the ticket and replaced by `→ <skill file name>`: the skill is the one place for it.
- **A skill was updated or created** (`<skill> — updated by / created from this ticket`) → say so and ask what to add
  to it; an update writes `<skill> — updated by this ticket: <what changed>` in `## Knowledge`.
- **No decision recorded** → show the same three-criteria block with your recommendation and ask.

## Any other learning — read only the part you need

- **Promotion** (`/learning promote`, or the same pattern seen 2–3 times or more) → `.ai/procedures/learning-promote.md`.
- **A lesson that is not a skill** (a gotcha of a service, a global rule, a specific case, a bug pattern) →
  `.ai/procedures/learning-destinations.md`: the five destinations and how to ask for one.
- **Business or domain knowledge** (destination 4) → `.ai/procedures/skills.md`.

## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
