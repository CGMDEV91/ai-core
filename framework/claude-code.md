# Claude Code — the methodology's words, in your tools

- `workdir` = `<folder>` → `git -C <folder> …` or `cd <folder> && …`. A subagent → the Task tool with its `subagent_type`, a closed scope and the key.
- The ticket header arrives as `<ticket-context>`; a hook records your edits in your diary. "restart opencode" → a new session.
- **Before checking anything in the browser yourself**: give the human the manual test steps (URL, role, actions, expected result) and ask whether they test it or you do. Open the browser only on a yes.
