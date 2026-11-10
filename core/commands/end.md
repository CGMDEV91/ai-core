# /end — end of a working session (the ticket stays open)

Ticket key (optional): `$ARGUMENTS` — if empty, the ticket worked on in this session.

Steps:
1. Ask **one** question in the human's language: confirm what was done (your 2–3 line summary) and the time
   spent (propose an estimate from the session start and `date`).
2. Only after the answer, in **your diary** `.ai/tickets/<key>/<key>.<you>.md` (`node .ai/scripts/cli.ts knowledge paths
   <key>`; a legacy flat ticket: its own file): overwrite `## Current state` (≤10 lines, ends with `Next: <one action>`)
   and append the `## Session log` entry. In the shared file only update `updated:` and tick the blocks you finished; append one Journal line to `.ai/MEMORY.local.md`
   (create it from `.ai/templates/MEMORY.local.template.md` if missing).
3. If the human said it did not work: record it as `Dead end:` in `Notes`, never as done.
4. Propose the `.ai` commit: `git -C .ai add tickets/<key>/` (+ any other `.ai/` file changed) and a message starting
   with the key — and the push: the others on the ticket see your state and your blocks only after it. Never commit.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: next session: `/ticket` (no key) resumes this ticket where it stopped.
