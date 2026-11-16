# Roadmap — pending, proposed, discarded

_Last updated: 2026-11-16_

## Pending (agreed as useful, not built)

| Item | What | Notes |
|---|---|---|
| Per-ticket metrics | `ai.mjs stats <KEY>`: time, tokens, calls, gate runs per ticket, from the opencode DB | the measurement in `measurements.md` was done by hand |
| Two-level gate | a fast gate in the inner loop, the full build (the Services table's gate) before review | today the tool gate and the table gate are separate steps |
| Contracts from specs | `contracts` from OpenAPI / RAML files, not only from code | IP tool services declare specs |
| Java code intelligence | an LSP (or Serena) for Java instead of the regex index | callers across modules |
| Incremental index | tree-sitter, re-indexing only changed files | big services re-index slowly |
| Subagents and skills per stack | a Drupal reviewer checklist, a Java tester… | ai-core 0.x had stack parts for its agents |
| Reconcile with the code on resume | when a ticket is resumed, compare `## Changes` / Current state with `git diff` — "the code wins" | was in ai-core 0.x `/ticket`, not in the intake yet |
| Light mode | a question or a one-line change without a formal ticket | v0's simplicity for trivial work |
| `service.md` by tool for Drupal | like `orchestrator --write`: version, modules, commands with real drush names | the model still writes aliases there |
| giportal migration | move its hand-written knowledge (conventions, 26 skills, known issues, field inventories) into a 1.0 `.ai/` | do not regenerate it with `/start`: migrate |

## Proposed (design only)

**Shared map for repositories that are not cloned.** One file per service, `.ai/context/map/<service>.json`, pushed
to git: only the interface (endpoints it exposes and calls, events, libraries, skills with their methods) with the
commit and date it was generated. Whoever works on a service regenerates its own map when a ticket touches its
interface. `impact` chains: changed method → endpoint it exposes → consumers in the other maps → their skills. The
result is a **warning** (what to review, whom to tell, how old each map is), never a check: without the repository
its gate cannot run. To validate with the real IP tool repositories first.

## Discarded

Dropped from the list of improvements when it was reviewed (2026-11-13); reopen only with a new reason.

| Idea |
|---|
| A small model for the cheap steps |
| A prefix cache on the model server (the gateway is not ours to configure) |
| A local read-only copy of Jira |
