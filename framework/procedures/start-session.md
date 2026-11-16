# Procedure — start of a command session

Used as the first step of `/analysis`, `/bugfix` and `/adaptive`. Inputs: the Jira key (the
command's argument) and what the stub injected (local time, the knowledge repo's branch). Nothing
here stops the command unless it says so.

**The knowledge repo is always reached through `.ai`.** `.ai/` is the knowledge repository; the
working directory around it is a plain folder, not a repository. So the agent runs git for the
knowledge repo with the bash tool's `workdir` set to `.ai`, and commands for the human are written
`git -C .ai …` with paths relative to `.ai/`. Never "git in the working directory" for it.

1. **Where you are.** `.ai/` exists in the working directory; otherwise stop and tell the human to
   launch opencode from the workspace folder (the one that holds `.ai/` and the services). That the
   working directory is not a git repository is expected. Note the session start time (injected;
   otherwise `date`).
2. **The key.** From the argument (`[A-Z][A-Z0-9]+-[0-9]+`). None → ask once. No ticket at all (a
   spike, a question) → `NOJIRA-<YYYYMMDD>-<owner>-<slug>`, analysis/plan only — no code change is
   handed over without a real key.
3. **The knowledge repo is the developer's.** Do not run `git status` on it and do not check what is
   or is not committed — not yours (non-negotiable 1). The only look at it, with `workdir` = `.ai`:
   `git fetch`, then `git rev-list --count HEAD..origin/master`; if the count is above 0, one line —
   *"origin/master is N commits ahead: `git -C .ai pull` when convenient — known issues and
   integrations may have changed"* — and continue. No remote configured → skip it silently.
4. **Tools.** If a procedure of this command names a tool you do not have in your tool list
   (`gojira_similar_incidents`, `gojira_search_logs`, …), say so once now and record
   `gojira: not available in this session` in the ticket's `Notes` when it exists. Never invent a
   tool's result.
5. **The ticket's services** (after `intake.md` has resolved `services:`): for each one, with the
   bash tool's `workdir` set to its folder — `git branch --show-current`, `git status --short`,
   `git log --oneline -5`.
   - The branch should be `feature/<key>` (or the ticket's `base:` override for a hotfix). If not:
     print the human's command — `git -C <service> switch -c feature/<key> <base branch>` — and
     continue. You never switch.
   - **Someone else's WIP rule (code only):** uncommitted changes in a service that are not this
     ticket's work are FORBIDDEN to modify, revert or commit before (a) reading the diff,
     (b) recording it (`Notes: WIP-other: <what> — acknowledged <date>`), (c) deciding with the
     human. A WIP already acknowledged in `Notes` is not asked about again. `UU`/`AA` lines or
     `<<<<<<<` markers → stop, tell the human; never edit a conflicted file.
   - Teammates on the same service: `git branch -r` (`workdir` = service) — an `origin/feature/*`
     branch other than this ticket's on a listed service is worth one line to the human.
6. **Bootstrap still open.** Count the `[QUESTION]` items in `.ai/CONTEXT.md` and the `[ASSUMED]`
   gates in the Services table of `.ai/orchestrator.md`; if any, one line: *"bootstrap pending: N
   questions, N unconfirmed gates"*. A gate `[ASSUMED]` means every "green" of this session is
   provisional — say so when you report one.
7. **The tools** (`.ai/scripts`, Node ≥ 22.6). `node --version`: below 22.6 or missing → one line ("the tools
   wait: gate, impact, touchpoints, the ticket header"), and every tool step of the procedures is done by hand.
   With Node: the ticket header the plugin adds to each message is the ticket's state in brief — it does not
   replace reading the ticket. Indexes older than the code (`node .ai/scripts/ai.mjs doctor` says so) →
   `node .ai/scripts/ai.mjs detect --index` before an impact analysis.
8. **The commit guard.** With `workdir` = `.ai`, `git rev-parse --path-format=absolute --git-path hooks/pre-commit`
   prints where the knowledge repo's hook lives (normally `.ai/.git/hooks/pre-commit`). If that file
   does not exist, one line recommending to copy `.ai/hooks/pre-commit-guard.sh` there — once per
   session.

**Report** (three lines, then continue with the command):
- **Ticket:** `<key> | <euipo_ref> | <type> | <title>` — services · status · `Next:` (or "new ticket")
- **Services:** per service — branch · clean/WIP · gate label
- **Pending:** master ahead · bootstrap items · missing tools · Node / indexes · hook — or "nothing"
