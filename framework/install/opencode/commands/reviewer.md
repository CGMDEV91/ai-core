---
description: Code review before commit or merge, run with a fresh context — one diff per service of the ticket. Categorizes findings and flags DB/API/contract/security/deployment impact. Usage — /reviewer [<Jira key>] [<service>] [<base branch>]
agent: reviewer
subtask: true
---
Knowledge repo (`.ai/`) — branch (the ticket key is in it):
!`git -C .ai branch --show-current`

@.ai/commands/reviewer.md

Follow the procedure in `.ai/commands/reviewer.md` exactly. If its content is not already included above,
read that file now — do not improvise a substitute and do not work from memory of what it usually says.
The services' diffs are obtained by the procedure, one service at a time, with the bash tool's
`workdir`; the knowledge repo's git status is never inspected — the documentation check reads the
ticket file and the knowledge files it names.
If there is no `.ai/` directory in the working directory, you are inside a service folder or the
methodology is not installed here: say so and stop.

Arguments (may be empty — a Jira key, a service name to narrow the review to, or a base branch): $ARGUMENTS
