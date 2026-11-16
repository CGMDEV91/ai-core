# Procedure — skills: when one is created, how it is updated, how it is linked

Read at the close (step 1), by `/learning` and by `/adaptive` when a business rule is decided. One `.ai/skills/`
for the whole workspace.

## The three criteria

**After every closed task** (fix or implementation), evaluate the business area it touched against three
criteria — and show the result to the human, who decides (`.ai/procedures/close.md` step 1.3):

1. **Recurrence** — has this business area been the subject of work or bugs more than once?
   (search `.ai/known-issues/` and `.ai/tickets/` with the grep tool and an **explicit path** — the
   workspace holds every service's code too, and a search from the workspace folder walks all of it — by the
   area's classes, endpoints or business terms; read only the hits, never the tickets by date)
2. **Specialisation** — does working here require business rules that cannot be deduced from
   the code alone (implicit domain knowledge, client decisions, surprising invariants)?
3. **Payoff** — would a skill measurably reduce rediscovery cost the next time someone touches
   this area?

- **Yes to all three** → **propose** the skill to the human (in their language): suggested
  title, scope, the services it runs through, key files (prefixed with their service), and what
  verified knowledge would go in it. Create it only after approval, from
  `.ai/templates/SKILL.template.md`, with the next free number, and register it in
  `.ai/skills/README.md` (index + quick decision guide).
- **No on any** → recommend no skill, with the criterion that fails and why; the human confirms, and only then
  `## Knowledge` gets `no skill: <why>`, the rule staying in the ticket's `Notes` (`Decision (date):`). Never create
  speculatively, never decline silently, and never put a business rule in `.ai/CONTEXT.md`.

**The skill is the single source of truth of a workflow's rules; tickets are its history.** A ticket that
decides or discovers a rule writes it into the skill at close (`.ai/procedures/close.md` step 1) and keeps only
a one-line reference in its `## Knowledge` — otherwise ticket 1 says X, ticket 6 says Y and the next session
cannot tell which holds. A ticket whose change touches the **methods** a skill cites is told so
(`node .ai/scripts/ai.mjs impact --stale-skills`, and the ticket header until `## Knowledge` names the skill):
it updates the skill or says why it is not affected — a skill is never left silently stale. A ticket without a
skill keeps its rules in `Notes` (`Decision (date):`); a later ticket that changes one marks the old line
`Superseded by <key>`.

Skills capture **verified** knowledge only: code actually read, bugs actually fixed, decisions
the client actually made. A skill written from guesses is worse than no skill. A workflow usually
crosses services, and a skill names them.

## Writing it (update or create)

Business rules, actor behaviours and workflow edge cases:

1. If a skill already covers the workflow (`.ai/skills/README.md` index) → write the learning into
   the appropriate section of that skill ("Business rules", "Edge cases", or "Related known issues")
   **as the rule in force**: a rule that changes is rewritten, not appended beside the old one; add a
   `## History` line `<key> (<date>): what changed` and the key to its `tickets:`; cite the files and
   methods in `## Key files` (`<service>/<path>` — `Class.method()`; in a single repository the path from its
   root, never with `./`), so `node .ai/scripts/ai.mjs impact` can match the next change on them. Show the diff.
   Then link both ways: the key in the skill's `tickets:`, and the ticket names the skill by its **file name** (without `.md`, e.g. `01-school-videos-language-filtering`) in its front matter `skills:` and in `## Knowledge` — the tools match skills by that name.
2. If no skill covers it → the three criteria above. They pass → propose it, and on the human's yes create it and
   link it both ways the same way. They do not pass yet → a `.ai/proposals/` note (destination 3 of
   `.ai/procedures/learning-destinations.md`) so the knowledge is not lost.

## In the ticket

`## Knowledge`, one line per skill, by its file name: `<skill> — created from this ticket: <rule in one line>` ·
`<skill> — updated by this ticket: <what changed>` · `<skill> — checked, not affected: <why>` · `no skill: <why>`.
What moved to the skill leaves the ticket and becomes `→ <skill>`.
