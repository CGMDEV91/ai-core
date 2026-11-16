# Claude Code — the methodology's words, in your tools

- "the bash tool's `workdir` set to `<folder>`" → `git -C <folder> …`, or `cd <folder> && …` in one Bash call.
- A subagent (`@executor`, the reviewer, security, architect, tester) → the Task tool with that `subagent_type`, a closed scope and the ticket key; relay its report once.
- The ticket header arrives as `<ticket-context>`; a hook records your edits in your diary.
- "restart opencode" → start a new Claude Code session.
