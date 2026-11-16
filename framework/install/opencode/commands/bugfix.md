---
description: The fix of a corrective ticket — plan when needed, regression test red-then-green, gate per service, fresh-context review, Jira test instructions, closure. Usage — /bugfix <Jira key>
---
Captured live for this session:

Session start (local time):
!`date`

Knowledge repo (`.ai/`) — branch:
!`git -C .ai branch --show-current`

@.ai/commands/bugfix.md

Follow the procedure in `.ai/commands/bugfix.md` exactly — it starts with `.ai/procedures/start-session.md`
and `.ai/procedures/intake.md`. If its content is not already included above, read that file now — do
not improvise a substitute and do not work from memory of what it usually says. If the values above
were not substituted (headless runs), obtain them yourself (`date`; `git branch --show-current` with the
bash tool's `workdir` set to `.ai`) — and if your environment does not let you, say so. The status of
the knowledge repo is never inspected; the status of the ticket's services is obtained by the procedure
with the bash tool's `workdir`.
If there is no `.ai/` directory in the working directory, you are inside a service folder or the
methodology is not installed here: say so and stop.

Jira key (mandatory): $ARGUMENTS
