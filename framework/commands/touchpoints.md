---
description: Every place a concept lives — a status, a field, a role, a route, a message key, a method — in every service, grouped by the kind of place (config, enums, entities, controllers, templates, translations, tests, knowledge). The checklist of a change. Usage — /touchpoints <term>[, <term>…] [— a question]
---

# /touchpoints — every place a concept lives

**When to use me**: before adding or changing a status, a role, a field, a permission, a route or a message — "where
are the existing ones wired?" — and in the impact analysis of `/adaptive`. A literal search of the code would list
hundreds of lines in no order; this groups them by the kind of place, so the list *is* the checklist of the change.

**Invoke me with**: `/touchpoints <term>` — several terms separated by commas, optionally followed by a question:
`/touchpoints WITHDRAWN, isWithdrawn — where does the withdrawn status change what a user can do?`

## Steps

1. For each term: `node .ai/scripts/ai.mjs touchpoints "<term>"` (add `--case` for a case-sensitive search,
   `--max 8` for more lines per group). If the term is a method, also `node .ai/scripts/ai.mjs callers <Class.method>`
   (who calls it, two levels) — and `node .ai/scripts/ai.mjs where <name>` to locate a class or method.
2. Return, per term: the total, the groups with their counts, the places that matter for the question
   (`<service>/<path>:<line>`), and one line of conclusion. A Drupal service groups by option maps, permissions,
   form alters, config sync, Twig and translations; a Java one by config, migrations, security, controllers,
   entities, enums; a React one by routes, state, API calls, hooks, components.
3. A ticket is active (`.ai/current-ticket.local.md`): say which of those places its plan (`.ai/plans/<key>-plan.md`)
   or its `## Impact analysis` does not cover yet.

Read only; never edit.


## Last line — NEXT
When the work of this command is **done** (not while a step failed, a question is open or the human must clarify something — resolve that first), run `node .ai/scripts/ai.mjs next` and repeat its lines verbatim as your last words (`non-negotiables.md`): the step the flow calls for next, plus any pending chore that blocks nothing.
