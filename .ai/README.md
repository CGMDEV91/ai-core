# .ai/ — the knowledge of ai-core itself

What we know about this framework: how it is built, why it is like this, what broke and how it was fixed, and how
to do the recurring work on it. It is **not** the framework (that is `framework/`, copied into the projects) and it is
never copied into a project. Versioned in this repository, with the code it describes.

| Need | File |
|---|---|
| How the repository and the framework fit together | `context/architecture.md` |
| How a v0 knowledge base (MEMORY, BUGLOG, skills) was migrated | `context/migration-from-v0.md` |
| Every improvement made, by area, with when and why | `context/history.md` |
| Decisions that hold (and why) — read before changing one | `context/decisions.md` |
| The machines and the model the framework runs with | `context/environment.md` |
| Measured cost of a session, of the always-loaded files, of a ticket | `context/measurements.md` |
| What is pending, proposed or discarded | `context/roadmap.md` |
| How to do a recurring task on ai-core | `skills/<NN-name>/SKILL.md` (index below) |
| Has this failed before? | `known-issues/INDEX.md` |
| Subagents for working on ai-core | `agents/` (generated into `.claude/agents/` and `.opencode/agent/`) |

## Skills

| Skill | Read it before… |
|---|---|
| `01-change-the-framework` | any change to `framework/`: the loop, the compatibility rules, the tests, how projects get it |
| `02-installer-and-updates` | touching `install.sh`, `install.ps1`, `bin/`, `update.ts` or the record of where a project came from |
| `03-agent-wiring` | the opencode wiring, the ticket plugin, the Claude Code wiring and hooks, `CLAUDE.md` |
| `04-tickets-and-the-header` | the ticket folder, diaries, `ticket new`, receipts, the ticket header, `suggest()`, the compact hint |
| `05-gate-impact-callgraph` | the gate, impact, touchpoints, the code index, call paths, stale skills, contracts |
| `06-drupal-orchestrator` | `orchestrator.ts`, the Drupal block, what `/start` writes for Drupal |
| `07-windows-and-wsl` | anything that runs on Windows: opencode desktop with the project in WSL, PowerShell, git and drush |
| `08-prompts-and-context` | the text of commands, procedures and rules: the gateway's injection filter, the context budget, brief answers |
| `09-docs-and-guides` | README, CHANGELOG, the quick guides, the timelines and PDFs |

## Keeping it

- A change to ai-core that teaches something (a rule, a gotcha, a decision) updates the skill or the context file
  it belongs to **in the same commit** — the `## History` line of the skill says what changed and when.
- A bug found and fixed with a confirmed cause gets a file in `known-issues/` and a row in its `INDEX.md`.
- `agents/` and `skills/` are the source: after editing them run `node .ai/sync.mjs` (it writes `.claude/` and
  `.opencode/`); `node .ai/sync.mjs --check` is part of the tests.
- Facts only, in English. No personal data, no secrets, no client data.
