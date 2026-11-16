# History — every improvement to the framework, by area

_Last updated: 2026-11-16_

## Lineage

1. **v0, hand-made (before 2026-07-30)**: a knowledge repo `.ai/` with `CLAUDE.md` / `AGENTS.md` at the root that said
   "read `.ai/orchestrator.md` first" plus a fallback copy of the critical rules; global `MEMORY.md` and `BUGLOG.md`;
   agents as Markdown the model had to read; bash drift scanners. Strong content (skills, field inventories,
   conventions), weak mechanics: it relied on the model obeying, memory grew forever, nothing could say NO.
2. **ai-core 0.1 → 0.20.12 (2026-11-10 → 11-13)**: per-project installer composing files from parts, `/ticket`,
   11 agents, TypeScript tools (gate, impact, touchpoints, code index, call paths), Claude Code target, workspaces,
   SonarQube, native Windows, receipts, `ticket new`, git/drush through WSL.
3. **Edu generic-guidelines 3.2 + our 3.3 branch (2026-11-11 → 11-13)**: Edu's method (workspace, `/analysis`
   `/bugfix` `/adaptive`, procedures, per-machine wiring) with ai-core's tools synced in by `ai-core-sync.sh`.
4. **ai-core 1.0.0 (2026-11-16)**: the 3.3 branch's method and every tool in this one repository; no Edu names, no
   sync; opencode or Claude Code; Drupal orchestrator by tool.

## Improvements over the Edu 3.2 base

| Area | Improvement | Why |
|---|---|---|
| Tickets | a folder per ticket: shared `<KEY>.md` + one diary per developer | two people on one ticket without merge conflicts |
| Tickets | `ticket new` builds the ticket from the template (keys, sections, baseline sha, owner), no comments | the model copied templates badly and wasted tokens |
| Tickets | compact tickets at close (shared file ~1,780 → ~1,255 tokens, nothing lost) | the ticket is re-read on every step |
| Header | ≤10-line ticket header attached to the message **only when it changed** (not in the system prompt) | stable system prompt; the next step always visible |
| Header | `suggest()` names the step the ticket's state calls for; `▶ Next` ends every finished command | the model lost the thread of the flow |
| Compaction | the ticket's state, decisions and dead ends added to the compaction summary | nothing lost after a compaction |
| Compaction | compact hint only at the end of a phase and above `AI_COMPACT_AT` (60k) | one summary call instead of re-sending a huge context |
| Gate | NEW vs PRE-EXISTING findings per service, in its repo and exec | old debt never blocks, new debt always does |
| Gate | receipts: the tool writes its own result line; folded into one `## Verification` line at close | the model reported "passed" without running it |
| Impact | impact by method against skills, known issues and past tickets; `impact --record` (code touched) | a change finds the flows and bugs on the same code |
| Skills | skills are the rules in force; `impact --stale-skills` blocks a silent close; linked both ways | rules lived scattered in old tickets |
| Skills | the skill question at close has two answers: update/create the skill, or no skill because… (never CONTEXT.md) | the model offered wrong destinations |
| Review | bounded rounds: findings in the ticket with hashes, round 2 incremental, two rounds then the human | endless review loops |
| Subagents | short fixed reports from reviewer / security / architect, relayed once; they read the instructions only when not given | context burned on long reports |
| Answers | brief answers rule (non-negotiable 8) | ~70 of 82 min of a session was the model writing |
| Procedures | parts read on demand (`skills.md`, `learning-*`, `close-when.md`) | fewer tokens per session |
| Stacks | scaffold per stack: Java rules only with Java; Drupal/React rules with the service; Sonar per service key | no Java rules in a Drupal project |
| Install | `--in-repo` for one repository (monorepo, Drupal site), `.ai/` excluded locally | not every project is a workspace |
| Install | readable steps, questions with detected defaults, summary and start timeline; already installed → says so | |
| Install | `install-ai-framework` / `update-ai-framework` terminal commands (bash + PowerShell via WSL); `/update-ai-framework` | one way to install and update everywhere |
| Install | retired wiring files removed on update | a retired command came back (duplicate `/update-framework`) |
| Windows | `ai.mjs` re-runs in WSL; plugin rewrites read-only git and drush to `ai.mjs git/run` | opencode desktop on Windows has no git/ddev |
| Drupal | real drush names (`cache:rebuild`, `config:export`…), `drush *` allowed | aliases failed for other people |
| Drupal | orchestrator built by `orchestrator --write`: version, modules, languages, checks, services, drush + gate table; team sections kept | `/start` wrote a weaker orchestrator than the hand-made one, non-deterministically |
| Doctor | one table, one fix per row; developer name as INFO; orchestrator freshness | |
| Agents | opencode or Claude Code or both (`--agent`), changeable with `update-ai-framework --agent / --reconfigure` | the old ai-core had Claude Code, 1.0 restored it |

## 1.0.0 fixes found while merging (see `known-issues/`)

`install.sh` stopping at the code checks with nothing to report (pipefail grep); a recorded `generic` stack getting
Java rules on update; tool messages naming `scan-*.sh` wrappers that no longer exist; call-path markers with old
wording; a project installed from Edu updated by its own old `update.ts`; a `start.md` line a gateway filter blocks.
