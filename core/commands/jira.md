# /jira — Jira drafts for a ticket

Ticket key (optional): `$ARGUMENTS` — empty = the active ticket (`.ai/current-ticket.local.md`).

Apply `.ai/agents/jira-writer.md` yourself (its drafts, rules and sources): read the ticket as one text — the shared
`.ai/tickets/<key>/<key>.md` and every dev's diary (`node .ai/scripts/cli.ts knowledge paths <key>` lists them) — and
write the four drafts under `## Jira drafts` of the shared file (replace the previous ones; nothing else changes).

Then **show them in your reply, in full**, so the human copies them from the conversation — one heading and one
` ```text ` block each, in this order: **Summary** · **Analysis comment** · **Test instructions** · **Worklog**. Plain
text that pastes cleanly into Jira; `<missing: …>` where the ticket lacks a fact. Nothing is posted to Jira: the human
does it.

## Next

End your reply with one `▶ Next:` line for the human: post the drafts in Jira (summary and analysis comment first) ·
then commit and push both repositories (`/close` gave the messages) — or `/close <key>` if the ticket is not closed yet.
