# /close — close a ticket

Ticket key (optional): `$ARGUMENTS` — if empty, the ticket worked on in this session.

Do these steps in order and stop to ask wherever it says "propose" or "ask":
1. **Confirmation.** The human has confirmed the result works (ask if not yet). No confirmation → do not close.
2. **Impact.** Re-run `bash .ai/scripts/analysis/scan-impact.sh --write-ticket <key>` (diff + the ticket's declared skills). Every ⚠ flow must have a `Notes` line
   `Impact: <skill> — re-tested [VERIFIED-BY-HUMAN …] | checked, not affected — <why>`. A ⚠ flow without one
   → ask the human; do not close.
3. **Verification hygiene.** Every `[VERIFIED]` in `## Verification` has an evidence line; list what was not verified.
4. **Known issue.** For a bugfix/analysis with a confirmed cause: create `.ai/known-issues/<key>-<short-slug>/<key>-<short-slug>.md`
   from `.ai/templates/known-issue.template.md`, or update the existing one (`related`, `last_seen`,
   References), and add its id to the ticket's `known_issues:`. Fill its `skills:` with `bash .ai/scripts/analysis/scan-impact.sh --files <its Files> --skills-only` plus the
   ticket's `skills:`, and cite methods in **Files**. Then run `bash .ai/scripts/knowledge/scan-known-issues.sh --update`.
5. **Skills (always ask).** Run the `skill-curator` (`/skill <key>` — or apply its instructions in
   `.ai/agents/skill-curator.md` yourself): it decides EDIT an existing skill / CREATE a new one / NOTHING from the
   ticket and `bash .ai/scripts/analysis/scan-impact.sh --key <key> --skill-signals`, and asks the human **one** question with its
   recommendation and reason. Also run `/scan` logic if a service, content type, field or form alter changed, and
   `bash .ai/scripts/knowledge/scan-references.sh` — no new ERROR may remain.
6. **Close the file.** In the shared file: `status: done` and `## Closure` — one line per dev diary (who did what:
   their `Changes` and last `Current state`; the diaries stay as history); final `## Session log` entry in your diary; one Journal line in
   `.ai/MEMORY.local.md`.
7. **Clear the active ticket:** delete `.ai/current-ticket.local.md` if it holds this key.
8. **Jira drafts.** Offer `/jira <key>` (analysis comment, test instructions, worklog for the human to post).
9. **Hand over.** Per repository, the list of changed files and one proposed commit message:
   `{{repo}}` (starts with the key, no mention of AI) and `.ai` (`git -C .ai add <paths>` by path).
   Remind the human to push **both** repositories: the `.ai` commit holds the ticket, known issue and skills the team
   needs (the project's `pre-push` hook warns if `.ai` is left behind). Never commit, push or switch.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: `/jira <key>` for the Jira texts (optional) · then the human commits with the proposed messages and pushes **both** repositories (`git push` and `git -C .ai push`).
