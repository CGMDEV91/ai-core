# Claude Code — how the methodology's words map to your tools

The methodology is written for opencode; in Claude Code the same steps use these tools:

- **"the bash tool's `workdir` set to `<folder>`"** → run the command in that folder: `git -C <folder> …`, or
  `cd <folder> && …` in one Bash call. Never change the session's directory for good.
- **A subagent** (`@executor`, "the reviewer subagent", security, architect, tester) → the Task tool with that
  `subagent_type`, a closed scope and the ticket key; relay its report once.
- **The ticket header** arrives with your message as `<ticket-context>`; after a compaction the ticket's state is
  added to the session. Edits to service files are recorded in your diary automatically.
- **"restart opencode"** → start a new Claude Code session (`/clear` is not enough after an update of the commands).
- Everything else — the commands, `node .ai/scripts/ai.mjs <tool>`, the tickets, the gate — is the same.
