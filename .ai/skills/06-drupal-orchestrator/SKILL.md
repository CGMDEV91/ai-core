---
name: 06-drupal-orchestrator
description: How orchestrator.ts builds .ai/orchestrator.md for projects with Drupal services — the generated ai:begin/ai:end blocks, the team's sections it keeps, the Drupal block template, how /start and /restart use it and what doctor checks. Read before changing orchestrator.ts, templates/orchestrator.drupal.md or Step 2 of /start.
---

# SKILL-06 — The Drupal orchestrator

## Purpose
`/start` used to have the model write the orchestrator from the template: non-deterministic, costly, and weaker than a
hand-made one. For Drupal, a tool now writes every fact that can be read; the model writes only the team's parts.

## Rules in force
- `node .ai/scripts/ai.mjs orchestrator [--write | --check]`; only when `project.json` has a Drupal stack (else it
  says so and `/start` uses `ORCHESTRATOR.template.md`).
- **Generated blocks** (rewritten on every run): `facts` (Drupal version from `core/lib/Drupal.php`, PHP of ddev,
  custom modules and themes per path, config sync, exec, languages from `language.entity.*.yml`, phpcs standards,
  phpstan level, SonarQube key, catalog `system:`), `services` (one row per service, base branch from
  `origin/HEAD`, the gate command), `drupal` (from `templates/orchestrator.drupal.md`: real drush names, the gate table
  with the evidence lines to quote, the claims rule for hook signatures and access handlers), `where` (the "Where
  things live" table of the template, rows that apply).
- **The team's** (kept from the file as it is, by heading): the intro, `## Conventions common to every service`
  (architecture, code style, specific restrictions, known gotchas — `/learning` appends there), `## Staleness`, any
  section they add, the Type and Owner cells of the Services table. A file without blocks (written by the model) is
  migrated: the team's sections are carried over and the blocks added.
- `/start` Step 2 runs it and writes only the intro, Type/Owner and the observed conventions `[ASSUMED]`; `/restart`
  re-runs it; doctor's `orchestrator` row warns when the blocks differ from what the code gives.
- Cost: the Drupal block adds ~700 tokens to every message (ideapow: ~3,580 / 4,000 always loaded).

## Key files
- `framework/scripts/lib/orchestrator.ts` — `build()`, `drupalFacts()`, `servicesBlock()`, `main()`
- `framework/templates/orchestrator.drupal.md` · `framework/templates/ORCHESTRATOR.template.md`
- `framework/commands/start.md` (Step 2) · `framework/commands/restart.md` · `framework/scripts/lib/doctor.ts` — `orchestrator()`

## History
- 2026-11-16 — a docroot at the repository root (`apiRoot: "."`) is detected and printed as `core` (KI-09); first real migration of a project (sme-website-epic).
- 2026-11-16 — written; tested on a copy of ideapow (migration, rerun, hand edits kept, from scratch), a two-service
  Drupal workspace and a project without Drupal.
