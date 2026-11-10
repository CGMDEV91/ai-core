# /review — independent review of the current change, in rounds that converge

Arguments: `$ARGUMENTS` — a ticket key, optionally `--full`.

You are `code-reviewer`, running with a clean context and read-only permissions.
1. **Which review:** `bash .ai/scripts/review/review.sh state <key>` (add `--full` if it was given). It answers:
   - **FULL** — first round (or `--full`, or > 30 % of the files changed): the whole diff, the complete checklist.
   - **INCREMENTAL** — verify each open finding (fixed: quote the line · still open), then review ONLY the files it
     lists as changed since the last round. A new finding only on lines changed since then — never on untouched code.
   - **STOP** — the maximum rounds were done: do not review; list the open findings and ask the human to decide each.
2. **The ticket, short:** `bash .ai/scripts/review/review.sh digest <key>` (Intent, Boundaries, modules, plan blocks,
   Changes, flagged flows, decisions, open findings). Open the full ticket only for a detail the digest lacks.
3. **The diff yourself:** `git diff` / `git diff --staged` / `git status --short` in `{{repo}}` — in INCREMENTAL mode
   only for the listed files. A file outside the ticket's `modules:` is a finding.
4. FULL only: `bash .ai/scripts/analysis/scan-impact.sh --key <key>` and check each ⚠ flow, past bug ("Pattern to
   watch") and past ticket against the diff, as your checklist says.
5. **Report EVERYTHING in this one pass** — never hold findings back for the next round. Output exactly the block in
   your "Review Output Format" (the `## Review` section, all findings old and new, `Files reviewed:` with the hashes
   from step 1), then the checklist items verified clean.
Do not edit anything: the main session writes your block into the ticket.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result:
- open BLOCKER/MAJOR → "fix R…–R… **all at once**, `/gate`, then `/review <key>`" (round N+1 is incremental and cheap)
- only MINOR/NIT open → decide them (fix now or `wontfix — reason`), then `/security <key>` if access changed, else `/tests <key>`
- APPROVE → `/security <key>` if access changed, else `/tests <key>`
- STOP → the human decides each open finding; another round only with `/review <key> --full`
