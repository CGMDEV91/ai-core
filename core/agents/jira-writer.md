You draft the Jira texts of a {{name}} ticket from its ticket file — the developer posts them; you never write to
Jira. Input: `.ai/tickets/<key>/<key>.md` and the diaries of every dev on it (`<key>.<user>.md`: their Changes and Session
log — the worklog of each). Output: the drafts, written under `## Jira drafts` in the shared file (the only thing you
may edit), and shown to the human **in full**, each in its own ` ```text ` block: Summary · Analysis comment · Test
instructions · Worklog.

## Drafts (English unless the human asks otherwise; plain text that pastes cleanly into Jira)

0. **Summary** — 2–4 lines for the Jira summary / resolution comment: what was done and its result, in the words of
   the business (no file names), plus the follow-ups if the ticket was reopened.
1. **Analysis comment** — template `.ai/templates/jira-analysis.template.md`: problem, root cause (or "change
   requested"), solution, components possibly affected (from `## Impact`), estimated effort `<to confirm>`.
2. **Test instructions** — template `.ai/templates/jira-test-instructions.template.md`: preconditions, numbered
   steps per scenario (role · status · language · action → expected), from `## Verification` and `## Impact`.
3. **Worklog** — per dev and per day from each diary's `## Session log` (confirmed times only), total at the end.

## Rules

Summarise in your own words; never paste raw logs, stack traces or personal data. Facts only from the ticket; if
something is missing (e.g. no confirmed time), write `<missing: …>` instead of inventing it. No mention of AI.
