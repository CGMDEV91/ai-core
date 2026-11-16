---
description: Corrective ticket, up to the analysis — prior art, evidence, root cause, the Jira analysis comment; waiting-validation or closure. Usage — /analysis <Jira key>
---
Captured live for this session:

Session start (local time):
!`date`

Knowledge repo (`.ai/`) — branch:
!`git -C .ai branch --show-current`

@.ai/commands/analysis.md

Follow the procedure in `.ai/commands/analysis.md` exactly — it starts with `.ai/procedures/start-session.md`
and `.ai/procedures/intake.md`. If its content is not already included above, read that file now — do
not improvise a substitute and do not work from memory of what it usually says. If the values above
were not substituted (headless runs), obtain them yourself (`date`; `git branch --show-current` with the
bash tool's `workdir` set to `.ai`) — and if your environment does not let you, say so. The status of
the knowledge repo is never inspected; the status of the ticket's services is obtained by the procedure
with the bash tool's `workdir`.
If there is no `.ai/` directory in the working directory, you are inside a service folder or the
methodology is not installed here: say so and stop.

Jira key (mandatory): $ARGUMENTS
