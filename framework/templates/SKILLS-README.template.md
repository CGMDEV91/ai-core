# [PROJECT_NAME] — Business Workflow Knowledge Base

Each file documents ONE business workflow: actors, rules, edge cases, and key files — across the
services of the workspace it runs through (the "Covers" column names them).
**Read the relevant file before implementing or debugging any feature related to that flow.**

Skills are created **on demand**, never speculatively: a skill is proposed when a business area
meets the recurrence + specialisation + payoff criteria in
`.ai/procedures/skills.md`, and created only after the human approves. They are
numbered sequentially in creation order (the number carries no meaning beyond identity).

## Index

| # | File | Covers |
|---|---|---|
| — | _(empty at bootstrap — skills are born from real work, not speculation)_ | |

<!-- Row format:
| 01 | [01-short-name.md](01-short-name.md) | One line: which workflow, which actors, which key rules. |
-->

## Quick decision guide

<!-- Grows together with the index. One line per common task, pointing to the skill(s) to read
     first. Format: "- **Touching X?** → SKILL-NN". Group by theme when the list grows. -->

- _(empty — add an entry every time a new skill is created)_

## Maintenance rules

- **Update the relevant skill in the same task that changes the behaviour it documents** — see
  the staleness tables in `.ai/orchestrator.md` and in each service's `service.md`. A merged change
  with a stale skill is not Done.
- **Cross-reference known issues**: when a confirmed known issue (`.ai/known-issues/`) touches a
  documented workflow, add its Jira key to that skill's "Related known issues" section as part of
  the same ticket.
- **Propose, don't create**: new skills go through the criteria in
  `.ai/procedures/skills.md` and require human approval.
- New skill files are created from `.ai/templates/SKILL.template.md`.
