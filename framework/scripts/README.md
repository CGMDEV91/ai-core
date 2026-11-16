# scripts/ — the deterministic tools

Run from the workspace folder: `node .ai/scripts/ai.mjs <tool> [args]` (Node ≥ 22.6; `ai.mjs` picks the right way
to run the TypeScript for the Node version). Nothing to install. A tool for one service only:
`node .ai/scripts/ai.mjs --service <service> <tool>`. Copied from ai-core by `install.sh` with the rest of the
framework, and replaced by every `update-ai-framework`: a change made here is lost on the next update.

| Tool | What it answers | Used by |
|---|---|---|
| `detect [--write \| --index]` | the services cloned → `.ai/project.json` (stack, code paths, exec); the indexes under `.ai/context/` | `install.sh`, `/start`, `/restart`, `/doctor` |
| `gate [--base REF] [--sonar]` | each changed service's checks, NEW vs PRE-EXISTING findings, the contracts touched, `RESULT` | `procedures/gate.md` |
| `impact [--key K] [--files …] [--write-ticket K] [--stale-skills] [--record K]` | the workflows, known issues and past tickets a change takes part in (by method) | `/impact`, `adaptive`, `review.md`, `close.md` |
| `touchpoints <term>` | every place a value lives, grouped | `/touchpoints` |
| `where <name>` · `callers <Class.method>` | locate code from the index; who calls a method | the agents |
| `review state\|digest\|open <key>` | the scope of this review round (FULL / INCREMENTAL / STOP) | `review.md`, the reviewer |
| `knowledge whoami\|paths K\|combined K` | who you are in diaries; the ticket's files; the ticket as one text | `intake.md`, `close.md` |
| `knownissues --update` · `callpaths --update` · `contracts` | the known-issues index; the skills' call paths; the endpoints between services | `close.md`, `/restart` |
| `references` | paths and methods the knowledge cites that no longer exist | `/restart` |
| `qa [--setup \| --off \| --on]` | the code checks of the gate: set up, missing, or off by decision | `install.sh`, `/doctor` |
| `doctor` · `budget` · `promptcheck` | the set-up; what loads on every message; the lines a model gateway blocks | `/doctor` |
| `layout --migrate` | flat tickets / known issues → one folder each | a knowledge base with flat files |
| `orchestrator [--write \| --check]` | `.ai/orchestrator.md` of a project with Drupal services, built from the code; the team's sections kept | `/start`, `/restart`, `/doctor` |
| `ticket new <KEY> --type … --title …` | the ticket folder, its shared file and your diary, from the templates | `intake.md` |
| `receipts show \| fold <key>` | the result lines the tools write for the ticket; folded into it at close | the gate, `close.md` |
| `next` | the step the flow calls for next, plus pending chores | the last line of every command |
| `git -C <dir> …` · `run -C <dir> …` | read-only git, and drush, inside WSL when opencode runs on Windows | the opencode plugin |
| `update [--check \| --force]` | a newer ai-core: pulled and applied | `/update-ai-framework` |
| `claude install \| project \| check \| uninstall` | the Claude Code wiring: commands, agents and hooks in `~/.claude`; the project's `CLAUDE.md` | `install.sh --agent claude-code`, `/doctor` |
| `hook prompt \| session \| edit` | the Claude Code hooks: the ticket header, the state after a compaction, edits in your diary | `~/.claude/settings.json` |
| `deps [--install]` | what this machine lacks for the stacks of the project (git, ddev, php, java, npm…) | by hand |

`opencode/plugin/` holds the ticket plugins the per-machine stub (`install/opencode/plugin/ai-methodology.ts`) loads:
`ticket-context` (the header on every message, the state kept after compaction) and `ticket-changes` (edits recorded
in your diary; a Drupal PHP file linted on the spot).
