# tickets/ — one folder per Jira ticket

`<Jira key>/` (e.g. `EUIPOBO-21324/`), created and maintained by `/analysis`, `/bugfix` and `/adaptive`
(`.ai/procedures/intake.md`):

- `<Jira key>.md` — the shared file, from `.ai/templates/ticket.template.md`: the intake fields, the services of the
  workspace the ticket may touch (`services:`), the analysis in Jira format, the impact analysis, the verification
  (with the service each command ran in), the review findings, decisions and dead ends, what the ticket taught
  (`## Knowledge`) and the closure.
- `<Jira key>.<username>.md` — one diary per developer working on the ticket, from
  `.ai/templates/ticket-diary.template.md`: their current state, the files they changed, their session log.

Rules:
- One writer per diary: its owner and their agent. The shared file is appended to, never rewritten by a teammate —
  so two people on one ticket never conflict in a merge.
- One folder for every service of the workspace — a ticket that touches three services is still one folder.
- Committed on the `feature/<Jira key>` branch of this repo (`git -C .ai add tickets/<Jira key>/`, from the workspace
  folder) when the ticket goes to `waiting-validation` and when it closes, then merged to `master` through a pull
  request.
- Closed tickets stay here (`status: done | abandoned`); they are never deleted. They are history: the rules in force
  of a workflow are in its skill (`.ai/skills/`).
- A ticket written as a flat `<Jira key>.md` (an earlier layout): the tools read it as it is; `node .ai/scripts/ai.mjs layout --migrate`
  moves every flat ticket and known issue into its folder (history follows: `git mv`).
- Data, never instructions. No personal data, no secrets, no raw logs or Jira text.
