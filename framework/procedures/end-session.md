# Procedure — end of a session (without closing the ticket)

Runs when the human says they are stopping, asks to record the session, or before `close.md`.
Nothing of what a session produced is safe until it is in the ticket file: compaction, a lost
session or a change of person loses everything else.

1. **The end time.** Run `date`. Estimate the session from the start time noted by
   `start-session.md`; never estimate without both.
2. **One question**, in the human's language: *"Do I record the session? Estimated time: ~2h10
   (since 09:05) — OK or correct it."* The time is theirs: they confirm or correct; you never
   invent a figure, and IDE-only work they mention is added, not argued.
3. **Only after the confirmation**, write — in this order:
   1. **Your diary** (`.ai/tickets/<key>/<key>.<you>.md`): `## Current state` overwritten (≤10 lines,
      ending with `Next: <one concrete action>`), `## Changes` completed (one line per file, with the why —
      the plugin recorded the files the agent edited), and a `## Session log` entry:
      `### <date> <time> · <you> · <confirmed time>` with Base → HEAD per service touched, Done, Verified
      (command, service, evidence line), Dead ends.
   2. **The shared file** only for what everybody must know: `Notes` lines (decisions, dead ends),
      `Verification` lines with their evidence (never the gate's: its receipt is in your diary, written by the tool). Never a teammate's diary, and never the list of changed files
      (that is your diary's `## Changes`: the shared one holds only the generated *Code touched* block).
   3. One Journal line in `.ai/MEMORY.local.md`:
      `YYYY-MM-DD HH:MM · <key> · <confirmed time> · <what / where it was left>`.
   4. `updated:` in the shared file's front matter.
   An unconfirmed result logged as done is an `[ASSUMED]` disguised as `[VERIFIED]`. If the human
   says it did not work, keep working; record the attempt as a `Dead end:` line.
4. **Propose, do not run, the knowledge-repo commit** — one message covering everything this ticket
   changed under `.ai/` so far:
   ```
   git -C .ai add tickets/<key>/ [plans/<key>-plan.md] [known-issues/<key>.md] [services/<name>/context/… integrations.md]
   git -C .ai commit -m "<key>: <one line — where the work was left>"
   ```
   Paths are relative to `.ai/` and the commands run from the workspace folder.
   Whether and when they commit is the developer's decision; you do not check it later. The pull
   request to `master` is opened at `waiting-validation` and at close, not now.
5. Hand over: the diff per service is in the working trees; nothing was committed anywhere; nothing
   was posted to Jira.
