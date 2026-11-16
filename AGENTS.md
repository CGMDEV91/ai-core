# ai-core — instructions for working on this repository

ai-core is an AI coding framework (commands, procedures, subagents, rules and TypeScript tools) that `install.sh`
copies into projects as `.ai/`. This repository's own knowledge is in `.ai/` — **not** the framework (`framework/`).

**Read first:** `.ai/README.md` (the index), then the skill of the area you touch:

- change anything in `framework/` → `.ai/skills/01-change-the-framework/SKILL.md`
- installer, updates, terminal commands → `02` · agent wiring, plugins, Claude Code → `03` · tickets, receipts, header → `04`
- gate, impact, call graph → `05` · the Drupal orchestrator → `06` · Windows and WSL → `07`
- the text of prompts, the gateway filter, context budget → `08` · README, guides, changelog → `09`
- how it is built and why → `.ai/context/architecture.md`, `decisions.md`; what broke before → `.ai/known-issues/INDEX.md`

## Rules

1. The source of the framework is `framework/` here. Never edit a project's `.ai/scripts` or `.ai/commands` to fix it.
2. `install.sh` and `install.ps1` change together; installed projects keep working (old names, markers, layouts are read).
3. Run the tests before saying a change is done: `node --experimental-strip-types --test tests/*.test.mts` (~4 min;
   the `test-runner` subagent runs it and reports only failures). `./selftest.sh` adds the Windows checks from WSL.
4. Text added to commands, procedures or rules must pass the gateway's injection filter (skill 08: no "you are in…").
5. A change that teaches something updates the skill or context file it belongs to, in the same commit; a bug fixed
   with a confirmed cause gets a `.ai/known-issues/` entry. After editing `.ai/agents` or `.ai/skills`: `node .ai/sync.mjs`.
6. Tests and comparisons run with Qwen or DeepSeek models only, never Claude models.
7. Never commit or push unless asked. Commit messages short, no co-author line. Docs prose: no em dashes or semicolons.

Subagents (`.ai/agents/`): `framework-reviewer` (review a diff), `test-runner` (run the tests), `docs-writer` (README, CHANGELOG, guides).
