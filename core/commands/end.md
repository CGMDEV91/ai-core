# /end — end of a working session (the ticket stays open)

Ticket key (optional): `$ARGUMENTS` — if empty, the ticket worked on in this session.

Steps:
1. Ask **one** question in the human's language: confirm what was done (your 2–3 line summary) and the time
   spent (propose an estimate from the session start and `date`).
2. Only after the answer: overwrite `## Current state` (≤10 lines, ends with `Next: <one action>`); append the
   `## Session log` entry; update `updated:`; append one Journal line to `.ai/MEMORY.local.md`
   (create it from `.ai/templates/MEMORY.local.template.md` if missing).
3. If the human said it did not work: record it as `Dead end:` in `Notes`, never as done.
4. Propose the `.ai` commit: `git -C .ai add tickets/<key>.md` (+ any other `.ai/` file changed) and a
   message starting with the key. Never commit.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: next session: `/ticket` (no key) resumes this ticket where it stopped.
