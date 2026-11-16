# Decisions that hold — read before changing one

_Last updated: 2026-11-16_

| Decision | Why |
|---|---|
| Tests and comparisons run with Qwen / DeepSeek models only, never Claude models | the projects run on the corporate Qwen gateway; results must reflect it |
| The agent never commits, pushes or switches branches, in any repository | the human owns every commit; permissions deny git writes |
| Nothing AI enters a client repository: `.ai/` and `CLAUDE.md` are excluded locally, the wiring is per machine | client repos stay as the client has them |
| ai-core is the only source: no other methodology repository, no sync | one place to change, one version |
| A fact a tool can compute is never left to the model (gate result, ticket file, orchestrator facts, receipts) | the model guesses and claims; tools do not |
| Drush by its real command names everywhere, never aliases | commands in tickets must run for anyone |
| `install.sh` and `install.ps1` change together | Linux/WSL and Windows users get the same behaviour |
| A change keeps installed projects working: old record names, old markers, old layouts are read | projects update at their own pace |
| Generated blocks (`ai:begin` / `ai:end`, `call-path:begin`) are the tool's; everything else is the team's and is kept | regeneration never loses hand-written knowledge |
| Brief answers; subagents return short fixed reports | most session time was the model writing |
| A business rule goes to a skill, never to `CONTEXT.md` | skills are the rules in force |
| Docs prose: no em dashes or semicolons, no mentions of other repositories, EN and ES kept twins | house style of the guides |
| Commit messages short, no co-author line; push only when the owner says so | owner's rule |
