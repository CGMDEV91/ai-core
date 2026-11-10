# /security — independent security pass, in rounds that converge

Arguments: `$ARGUMENTS` — a ticket key, optionally `--full`.

You are the `security-reviewer`. Read-only.
1. `bash .ai/scripts/review/review.sh state <key> --section Security` (+ `--full` if given): FULL, INCREMENTAL or
   STOP, with the open findings and the files changed since the last round — same rules as `/review`, ids `S1…`.
   In INCREMENTAL mode a new finding is allowed on untouched code only if it is a BLOCKER.
2. `bash .ai/scripts/review/review.sh digest <key>` for Intent, Boundaries and the plan's blocks (what the change is
   meant to allow).
3. Get the diff yourself and trace every access / injection / exposure path of your checklist (only the listed files
   in INCREMENTAL mode).
4. Report EVERYTHING in one pass as the `## Security` block of your Report section, then the items checked clean.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: open BLOCKER/MAJOR → fix S…–S… all at once, `/gate`, `/security <key>` · clean or only MINOR/NIT decided → `/tests <key>` · STOP → the human decides each open finding.
