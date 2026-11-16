# Procedure — closing a ticket

The last step of `/analysis` (analysis-only outcomes) and of `/bugfix` and `/adaptive` (code
changes). Close only when every check passes or the human explicitly accepts a ❌. Order matters:

0. **`end-session.md` first** — the session's work and time confirmed and recorded. Closing never
   skips that confirmation.
1. **The knowledge — skills are the rules in force, tickets are history.** A rule decided or discovered in
   this ticket lives in ONE place, the skill of its workflow; otherwise ticket 1 says X, ticket 6 says Y and
   nobody knows which holds. So, before closing:
   1. `node .ai/scripts/ai.mjs impact --record <key>` (the Code touched block), then
      `node .ai/scripts/ai.mjs impact --stale-skills --key <key> --base '<baseline of the front matter>'` —
      one line per skill whose **methods** this ticket changed (`skill<TAB>why`).
   2. Read every dev's work on the ticket (`node .ai/scripts/ai.mjs knowledge combined <key>`: the shared file
      and every diary) and decide, per skill — the stale ones, the ones in `skills:`, and any workflow the
      ticket taught something about:
      - **update it**: the rule in force in its `## Business rules` / `## Edge cases` (rewritten, not
        appended — the old wording goes), the key files and methods in `## Key files`, one `## History` line
        `<key> (<date>): what changed`, the key in its `tickets:` — and the skill's file name in the ticket's
        `skills:` (the link back);
      - **checked, not affected** — say why (the method changed, the rule did not);
      - **a new skill** only when the criteria of `.ai/procedures/skills.md` are met
        and the human approves the proposal (`/learning` writes it).
      Each change to a skill is shown to the human as a diff before it is written.
   3. **No skill covers what the ticket touched → the human decides, never you alone.** Show, then stop for
      the answer:
      ```
      Skill: <the business area this ticket touched>
      - Recurrence:     yes | no, <evidence: other tickets, known issues, a Jira key in the code>
      - Specialisation: yes | no, <a rule the code alone does not tell: a client decision, an invariant>
      - Payoff:         yes | no, <what the next person would not have to rediscover>
      Proposal: <title · scope · key files with their methods>   (or)   Recommendation: no skill, because <why>
      Create it? (yes → /learning writes it · no → ## Knowledge: no skill: <why>)
      ```
      Only the human's answer goes to `## Knowledge`. The question has exactly these two answers (also when you
      ask it with a question tool): **create the skill**, or **no skill: <why>** — then the rule stays in the
      ticket's `Notes` as a `Decision (date):` line. Never `.ai/CONTEXT.md` (project-wide permanent decisions, its own
      pull request) and never "skip": a skill decision is never left unrecorded.
   4. In the ticket, `## Knowledge` — SHORT, one line per skill, named by its **file name** (`01-<name>`, without `.md` — the
      tools match on it): `<skill> — created from this ticket: <rule in one line>` /
      `<skill> — updated by this ticket: <what changed, in one line>` / `checked, not affected — <why>` /
      `no skill: <why>`. The detail is in the skill, not repeated here: what moved to the skill (rules, edge cases
      worked out in `## Analysis` or `Notes`) is **removed from the ticket** and replaced by `→ <skill>`. A
      ticket WITHOUT a skill keeps its rules in its `Notes` (`Decision (date):` lines); when a later ticket
      changes one of them, it marks the old line `Superseded by <key>` — the newest decision wins.
   5. Never close with a stale skill nobody looked at: the ticket header keeps asking for it until
      `## Knowledge` names it.
   6. **Compact the ticket** — it stays as history, so it keeps each fact once and only what a later reader needs:
      - `## Changes` of the shared file: only the generated *Code touched* block (`impact --record`); the list of
        files with their why lives in each diary, never copied here.
      - `## Review`: the open and `wontfix` rows stay; the fixed ones become one line per round
        (`Round 1: 5 findings, 3 fixed, 1 wontfix (R5), 1 open (R2)`); `Files reviewed` goes.
      - `## Impact analysis`: the generated block, one `Impact:` line per flow, the risks and the rollback; never a
        restated list of files (*Code touched* has them) nor a "none" line for what does not apply.
      - `## Verification`: one line per check, the latest; no gate lines (the gate's result is its receipt, folded at
        step 3).
      - `Notes`: a `Decision` whose rule moved to a skill becomes `Decision (date): … → <skill>`.
      Show the human what the compaction removes before writing it.

2. **The checks**, each reported ✅ / ❌. Items that depend on something the human did ("pasted into
   Jira") are **questions to the human**, never ticked on your own.
   **Also read `.ai/procedures/close-when.md`** (more checks) when ANY of these holds — otherwise they do not apply:
   the ticket is `corrective` or has a `resolution`; a contract, an event, a shared table or a library changed; a
   service or library outside the workspace is involved; the ticket is being abandoned.

| Check | Rule |
|---|---|
| Header complete | `euipo_ref` ≠ `PENDING` — still `PENDING`: ask for it with the note *"An internal bug or task with no EUIPO reference: answer `euipo_ref: none (internal)`."*; `type` set; corrective → `resolution` set |
| Services | `services:` equals the set of services with code changes for this ticket: `git log --oneline <baseline>..HEAD` **and** `git status --short`, with `workdir` set to each service of the Services table (a clean status is not "no change" — the human may have committed). A changed service not listed → fix the list (and read its `service.md`) before closing |
| Definition of Done | For a code change: the gate of EVERY service touched green with evidence; the regression test red-then-green for a logic bug; the flow exercised for real where the service can run locally; no secrets, no debug output (`System.out`, `var_dump` / `dpm`, `console.log`), no concatenated SQL; `## Changes` filled; knowledge files updated per the staleness tables (`.ai/orchestrator.md` and each touched service's `service.md`). For an analysis-only outcome: the analysis in the Jira format with a confirmed effort |
| Gate receipt | For a code change: the newest `gate` receipt in the diaries (`## Receipts`) says `exit 0` and `RESULT: PASS`, and no `## Changes` edit is later than it. A `[VERIFIED …]` line of the gate in `## Verification` with no receipt → ❌ "evidence without receipt": run `/gate`. A check you ran by hand is reported as "manual check, not the gate" |
| SonarQube | A service the ticket changed with a `sonar` row in `node .ai/scripts/ai.mjs qa` → `node .ai/scripts/ai.mjs gate --sonar` PASS (quality gate OK, 0 new issues), its `gate+sonar` receipt (Java: per `.ai/rules/sonarqube.md`). NOT RUN (no token, no scanner) → say it; never report it as passed |
| Test instructions | Code change: `## Test instructions` in the format of `.ai/templates/jira-test-instructions.template.md` — *has the human pasted them into Jira?* |
| Review | `Notes` carries `Review: <verdict>` for a code change, and the human reviewed anything touching auth, SQL, public contracts or the data model |
| Hygiene | Use the **grep tool with an explicit path** on `.ai/tickets/<key>/<key>.md` and any new `.ai/known-issues/` file: hidden characters `[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{2066}-\x{2069}]`; credentials `(?i)(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+`; e-mail addresses; a `\[VERIFIED` without ` — "` (a label without evidence). Any hit → fix before closing |
| Code touched | Code change: `node .ai/scripts/ai.mjs impact --record <key>` wrote the generated *Code touched* block in the shared file's `## Changes` (every file and method changed in every service, from `baseline:`) — what lets a later ticket on the same methods find this one |
| Knowledge | `## Knowledge` written (step 1) and no stale skill left: `node .ai/scripts/ai.mjs impact --stale-skills --key <key> --base '<baseline>'` prints nothing that `## Knowledge` does not name |
| Indexes | A known issue created or changed → `node .ai/scripts/ai.mjs knownissues --update`; a skill's key files changed → `node .ai/scripts/ai.mjs callpaths --update` |
| Learning | Evaluate `/learning` and the criteria of `.ai/procedures/skills.md`; propose, never create speculatively |

3. **`## Closure`** (in the shared file; each diary's `Current state` ends with `Next: none — closed`): summary in 2–4 lines, resolution, total confirmed time
   vs `manual_estimate` (both the human's figures — you only put them side by side), what went to
   `.ai/known-issues/`, the code MR or commit per service. Then `node .ai/scripts/ai.mjs receipts fold <key>`: the
   newest receipt of each tool becomes ONE line of `## Verification`, your diary loses `## Receipts`, the local
   outputs go. `status: done` (the ticket header disappears; delete
   `.ai/current-ticket.local.md` or point it at the next ticket) — or `abandoned` (`.ai/procedures/close-when.md`).
4. **Worklog summary** for Jira — the Journal lines of this ticket in `.ai/MEMORY.local.md`, grouped
   by day; label it "draft worklog from agent sessions — add IDE-only time":
   ```
   2026-10-07 · 2h30 · reproduced the timeout, root cause not yet found
   2026-10-08 · 3h00 · fix + regression test green
   Total: 5h30   (manual_estimate: 8h)
   ```
   A day with no confirmed time is reported as such; nothing is invented. The human logs it in Jira.
5. **Commit messages** — no mention of AI, no trailers, one per repository touched:
   - each service: following its own conventions, starting with the key — `EUIPOBO-21324 Restore response timeout on the validation client`;
   - the knowledge repo, everything this ticket changed under `.ai/` in one commit —
     `EUIPOBO-21324: closed — code-defect, known issue added`, with `git -C .ai add <paths>` by path,
     relative to `.ai/` (`tickets/<key>/`, the plan, the known issue and `known-issues/INDEX.md`, the skills
     updated, `context/callgraph.json`, the context and integrations files touched) and `git -C .ai commit`, from the workspace folder.
   Remind: the human commits and pushes each service and the knowledge repo; in the knowledge repo,
   a pull request from `feature/<key>` to `master`. You never run `git commit`, `git push` or
   `git switch`, anywhere — and you do not check whether they did.
