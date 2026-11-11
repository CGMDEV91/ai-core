# /ticket — start or resume a piece of work

Arguments: `$ARGUMENTS` — a Jira key and/or a request in plain words. Both are optional.
Options anywhere in the arguments (remove them from the request text):
- `--touchpoints a,b,c` → run the `touchpoints` tool for each term in step 5 (in addition to the automatic ones).
- `--impact` → show the risk report in step 5 even before the files are final (from the methods found with `where`).
- `--no-auto` → skip the automatic touchpoints/impact of step 5 (quick, trivial tickets).

This command is the whole procedure (no other process file to load):

1. **Workspace check.** Run `ls .ai/project.json` from the `{{repo}}` root; when it is missing, report it and end here.
   Get the date (`date`). Decide once whether you need the `wsl.exe` wrapper (`.ai/core-rules.md` rule 6).
   **Team knowledge up to date:** `node .ai/scripts/ai.mjs sync --remote`. `BEHIND n` → tell the human and propose
   `git -C .ai pull` before starting (other devs' skills, known issues and tickets are missing; the git hooks rebuild
   the indexes after the pull). Do not pull yourself. `UP TO DATE` / `NO UPSTREAM` → go on.
2. **Key.** A Jira key in the arguments → that key. No key and `.ai/current-ticket.local.md` exists → **resume that
   ticket** ("sigue por donde estábamos" means exactly this). Otherwise propose `YYYY-MM-DD-<slug>` from the request
   in one line. Files: `node .ai/scripts/cli.ts knowledge paths <key>` → the shared `.ai/tickets/<key>/<key>.md`, **your
   diary** `<key>.<you>.md` (you = global git user.name) and the other devs on the ticket.
3. **Resume or create.**
   - Exists with `status: waiting-validation` → the analysis waits for the client's approval. The human says it was
     approved (`/ticket <key> approved`) → `status: active`, Notes `Decision (date): analysis approved — <by whom>`,
     go on; rejected (`/ticket <key> rejected <why>`) → Notes `Decision (date): analysis rejected — <why>`, back to
     the analysis. Nothing is implemented while it waits.
   - Exists with `status: done` (or `abandoned`) → it was closed. Ask **one** question: reopen it for this request (a
     follow-up on the same Jira issue) — or is it a new ticket? On **reopen**: in the shared file `status: active`, a
     `Notes` line `Reopened YYYY-MM-DD by <you>: <the request in one line>`, the request in `## Open points`, and new
     plan blocks after the last letter (`- [ ] D (<you>)`) — the old blocks, `## Impact`, `## Review` and `## Closure`
     stay as history (the next `/impact` and `/review` cover the new changes; `/close` adds a Closure line and updates
     the known issue). Your new work goes to **your diary** as usual (`Changes`, `Session log`). Then go on as below.
   - Exists → read the shared file (front matter, `Open points`, `Notes`, `## Plan`) and **your diary** (`Current state`,
     last `Session log` entry); read the other diaries' `Current state` — say who else is on it and what they hold.
     **Then reconcile with the code — never trust `Current state` alone** (the session may have ended without
     `/end`): compare `git status` / `git diff --stat` and the auto-recorded `## Changes` with the `## Plan`. If they
     disagree, the code wins: rebuild `Current state` from what is really done. Tell the human in a short table
     which plan steps are done / partly done / pending, what is unverified (no evidence in `## Verification`), the
     open points, and the `Next:` action — then wait for "go".
   - New → classify (bugfix | feature | analysis | chore), then ask **one** question for what you cannot
     infer: intent (your 1–3 line summary, to confirm), boundaries, modules. Business decisions you find open
     (how many, who sees what, who is notified…) are **separate** questions, asked one at a time, never decided
     by you (core rule 2). Create the file from `.ai/templates/ticket.template.md`; copy every point the human
     asked for into `## Open points`.
   Write the key (one line) to `.ai/current-ticket.local.md` — the ticket-changes plugin then records every file
   you edit in `## Changes` (fill in the *why* of each auto-recorded line).
   - New → create the shared file from `.ai/templates/ticket.template.md`; your diary is created on your first edit
     (or now: it holds `Current state`, `Changes`, `Session log`). Never write another dev's diary.
   - **Plan blocks have an owner** (`- [ ] B (<user>)`). "go" → take your own open block, else the first free one and
     write your name on it in the shared file *before* coding; a block owned by somebody else → ask the human.
4. **Code state.** `git status --short` and `git branch --show-current` in `{{repo}}`; record `branch` and
   `baseline` (`git rev-parse --short HEAD`). **Workspace** (project.json stacks with `repo`): the same in each service
   the ticket may touch (`git -C <repo> …`), listed in `services:` with its branch and baseline in Notes. Uncommitted work not of this ticket → `WIP-other:` note and ask.
5. **Prior art.** `.ai/known-issues/INDEX.md` → open only matching entries · `grep -ril "<keywords>" .ai/tickets/`
   · load the skills of the area (skill tool) and list them in `skills:`; related bugs found go to `known_issues:`.
   **The skills are the rules in force; past tickets are history.** Without a skill, the newest ticket on the same code
   wins (its `## Knowledge`); a ticket marked `Superseded by …` is never followed.
   Write `## Prior art`.
   Mention any matching "Pattern to watch" before starting.
   **Locate, don't guess (core rule 3):** `where` for every class/method you will reason about, then read only
   its line range. For access/permission/workflow changes, first list the handlers of the Drupal event involved
   (`where` kind `event`, e.g. `ENTITY_ACCESS`, `ENTITY_PRE_SAVE`).
   **Automatic for feature tickets** (and for a bug about a status, field, role or access rule), unless `--no-auto`:
   - `touchpoints` on the 1–3 concepts the change extends (the status / field / role / ownership check — e.g.
     `getOwnerId`, `currentUserIsAuthor` for "who can act on the application") → the list of every place to
     review; say which of them the change must touch and which not, with the reason;
   - `impact` with `files` + `methods` of the code you located → flows, past bugs and past tickets sharing it.
   Present both as two short tables **before** proposing the plan, and record the places in `## Prior art`.
   Add the skills you used to understand the flow to `skills:`.
6. **Route by size.**
   - **Small** (one module, ≤ ~30 lines, no new service/field/transition) → implement here.
   - **Not small** → ask the human: run `/plan <key>` (backend-architect) first? On approval of the plan,
     delegate each step to `@fullstack-developer` with the key and the step, and review every returned diff.
   - **bugfix of logic, and the project has tests** → the regression test first: write it, run it **red** (its failing
     assertion is the evidence), then fix and run it green. A test that was never red proves nothing.
   - **the client must approve the analysis before any code** (the human says so) → write the analysis and the plan,
     `status: waiting-validation`, and stop: `/jira <key>` gives the analysis comment to send.
   - **bug with unknown cause / analysis** → delegate the diagnosis to `@debugger` (`/debug`): it returns the proven
     root cause or what was ruled out. Write it in `Notes`; stop and ask whether a fix follows.
7. **Gate** — delegate to `@gate-runner` (`/gate`) after each implementation block: it returns pass/fail and the
   `[VERIFIED …]` strings for `## Verification`; its long output never enters this session. Fix NEW errors, re-run; when it
   passes, tick the block (`- [x] A …`) in the plan's `Blocks:` list and update `Next:`.
   **Impact** on the real diff: follow `/impact <key>` (writes `## Impact`, re-test checklist per ⚠ flow).
8. **Open points check.** Re-read `## Open points`; anything not ticked goes back to the human in a table.
9. **Stop for validation.** Summarise the change and ask the human to test it (in their language) — the change itself **and** the ⚠ flows of `## Impact`.
   Suggest `/review <key>` for anything beyond a trivial change, **and `/security <key>`** when the change touches access,
   roles, ownership, web services or personal data; `/tests <key>` writes the manual checklist. Do not log success until they confirm.
   Next steps for the human: `/end` (pause) or `/close` (finished).

Never commit, push or switch branches.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: `/plan <key>` (adaptive, or a bug fix that is not trivial) · `/debug <key>` (bug, cause unknown) · "go" (small and clear) · `/end` (stop here).
