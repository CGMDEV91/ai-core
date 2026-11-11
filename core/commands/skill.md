# /skill — where does what this ticket taught live from now on?

Ticket key (optional): `$ARGUMENTS` — if empty, the active ticket (`.ai/current-ticket.local.md`).

Run before `/close` (▶ Next proposes it), and whenever several devs worked on the ticket. Apply
`.ai/agents/skill-curator.md` yourself, in this session: you must ask the human and wait for the answer.

**The rule:** a skill is the single source of truth of a flow's rules. A ticket is history. When a skill covers the
work, the knowledge moves into the skill and the ticket keeps only the reference — never the same rule in two places.

1. **Read** the whole ticket folder (`node .ai/scripts/cli.ts knowledge combined <key>`: shared file + every diary),
   the signals (`node .ai/scripts/cli.ts impact --key <key> --skill-signals`) and the **skills this ticket must update**
   (`node .ai/scripts/cli.ts impact --stale-skills --key <key>`: the skills whose cited methods or call path the change
   touched).
2. **Every stale skill** gets an answer: an EDIT drafted from the diff (`git diff <baseline>` of its cited methods) and
   the ticket's decisions — the rules that changed are rewritten in place (the old wording goes away), Key files and
   methods follow renames, a `## History` line `<key> (<date>): <what changed>` is added — or `unchanged — <why>`
   when the change does not alter what the skill states.
3. **New knowledge** with no skill: CREATE when the curator's criteria hold; otherwise NOTHING.
4. **Ask once**, recommendation first, showing every draft. On yes: write, then
   `node .ai/scripts/cli.ts callpaths --update` and `node .ai/scripts/cli.ts references --quick`.
5. **The ticket** (shared file):
   - with a skill (CREATE / EDIT): `## Knowledge` is only the decision and the links; the passages that explain the
     flow move to the skill and become `→ skills/<name>` (Decisions, evidence, Impact, Review and Closure stay);
   - NOTHING: `## Knowledge` keeps the rules this ticket established (short); a past ticket on the same code whose
     `## Knowledge` stated something this one changed gets `Superseded by <key> (<date>): <what>`;
   - in every case `skills:` lists the skills it updated, and each skill's `tickets:` lists this key.

## Next

End your reply with one `▶ Next:` line: `/close <key>` · `/audit` first if several skills changed.
