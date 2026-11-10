# /ticket — start or resume a piece of work

Arguments: `$ARGUMENTS` — a Jira key and/or a request in plain words. Both are optional.
Options anywhere in the arguments (remove them from the request text):
- `--touchpoints a,b,c` → run the `touchpoints` tool for each term in step 5 (in addition to the automatic ones).
- `--impact` → show the risk report in step 5 even before the files are final (from the methods found with `where`).
- `--no-auto` → skip the automatic touchpoints/impact of step 5 (quick, trivial tickets).

This command is the whole procedure (no other process file to load):

1. **Environment.** You are in the `{{repo}}` root and `.ai/` exists — if not, say so and stop.
   Get the date (`date`). Decide once whether you need the `wsl.exe` wrapper (`.ai/core-rules.md` rule 6).
2. **Key.** A Jira key in the arguments → that key. No key and `.ai/current-ticket.local.md` exists → **resume that
   ticket** ("sigue por donde estábamos" means exactly this). Otherwise propose `YYYY-MM-DD-<slug>` from the request
   in one line. File: `.ai/tickets/<key>.md`.
3. **Resume or create.**
   - Exists → read front matter, `Current state`, `Open points`, `Notes`, `## Plan`, last `Session log` entry.
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
4. **Code state.** `git status --short` and `git branch --show-current` in `{{repo}}`; record `branch` and
   `baseline` (`git rev-parse --short HEAD`). Uncommitted work not of this ticket → `WIP-other:` note and ask.
5. **Prior art.** `.ai/known-issues/INDEX.md` → open only matching entries · `grep -ril "<keywords>" .ai/tickets/`
   · load the skills of the area (skill tool) and list them in `skills:`; related bugs found go to `known_issues:`.
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
