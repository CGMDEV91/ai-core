# /skill — what did this ticket teach, and where does it live from now on?

Ticket key (optional): `$ARGUMENTS` — if empty, the active ticket (`.ai/current-ticket.local.md`).

Run before `/close` (▶ Next proposes it when the work is verified), and whenever several devs worked on the ticket.
Apply `.ai/agents/skill-curator.md` yourself, in this session (you must ask the human and wait for the answer):

1. **Read the whole ticket folder** as one text — `node .ai/scripts/cli.ts knowledge combined <key>`: the shared file
   and every dev's diary (their Changes, Notes, Session log). Plus the signals and the covering skills (curator, Inputs).
2. **Decide** CREATE / EDIT / NOTHING with the curator's criteria and ask **one** question, recommendation first,
   showing the draft or the edit.
3. **On yes**, write the skill and link both ways (curator, After a "yes"). **Always** — also for NOTHING — write the
   shared file's `## Knowledge`: short, never a copy of the skill.
4. **Shorten the ticket** (ask once): what now lives in the skill is replaced in the shared file by one line
   `→ skills/<name>` — never Decisions, Verification evidence, Impact, Review findings or Closure. Other devs'
   diaries are theirs: never edited.

## Next

End your reply with one `▶ Next:` line: `/close <key>` · `/audit` first if several skills changed.
