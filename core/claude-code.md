# Claude Code — how the rules above map here

<!-- Imported by CLAUDE.md. The rules speak of opencode tools and commands; in Claude Code they are these. -->

- **Tools `where` / `callers` / `touchpoints` / `impact` / `gate`** are commands (allowed in `.claude/settings.json`):
  `node .ai/scripts/cli.ts where <query> [--kind method|class|service|route|event|hook|field|string]` ·
  `node .ai/scripts/cli.ts callers <Class::method()> [--callees]` · `bash .ai/scripts/analysis/scan-touchpoints.sh <term>` ·
  `bash .ai/scripts/analysis/scan-impact.sh --key <key>` · `bash .ai/scripts/gate/run-gate.sh [files]`.
  Use them before Grep/Glob; read only the line ranges they return.
- **Commands** (`/ticket`, `/gate`, `/review` …) are in `.claude/commands/`; the ones that run in a subagent
  (`gate-runner`, `code-reviewer` …) say so — launch that subagent with the Task tool.
- **The active ticket header** (key, Next, suggested command, open points) arrives with every message from a hook, and
  the ticket's state is re-injected after `/compact` or `--resume`. Every edited file is recorded in the ticket's
  `## Changes`, and the stack's lint (phpcs, hook signatures) comes back right after the edit.
- **Skills** are in `.claude/skills` (the same files as `.ai/skills`).
- Same memory as opencode: a ticket started in one agent continues in the other.
