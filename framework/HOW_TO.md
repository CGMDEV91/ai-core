# HOW TO — the commands, and when to use which

Day-to-day reference for the team. The agent's procedures live in `.ai/commands/` and
`.ai/procedures/`; opencode exposes the commands as `/name` through the stubs that
`.ai/install/install-opencode.ps1` installs once per machine in your opencode configuration.

**Setting up a workspace for the first time?** That is the README of the ai-core repository
(`install-ai-framework` in the project folder). **Joining an existing one?** Its `.ai/README.md`. **A worked example of a
corrective ticket over two days:** `.ai/examples/corrective-walkthrough.md`.

---

## Pick a command by situation

| Situation | Command |
|---|---|
| A production problem to analyse | `/analysis <Jira key>` |
| A confirmed defect to fix (after the analysis, or with your own diagnosis) | `/bugfix <Jira key>` |
| A change request or a new capability | `/adaptive <Jira key>` |
| "Should we build it this way?" — on its own | `/architect` |
| A review, an audit or tests, on their own | `/reviewer` · `/security` · `/tester` |
| Something surprised you and will surprise the next person | `/learning` |
| Fresh workspace · a service added · stack or contracts changed | `/start` · `/start <service>` · `/restart [service]` |
| "What else can this change break?" — workflows, past bugs, past tickets on the same methods | `/impact [<Jira key>]` |
| "Where is this status / field / role / message wired?" — every service, grouped | `/touchpoints <term>` |
| "Is my set-up healthy?" — wiring, guard, indexes, each service's tools | `/doctor` |
| A question, a quick look, a one-off edit | No command: plain use. Nothing is recorded, nothing is loaded beyond the map |

Three commands do the work. Each one takes the Jira key, creates or resumes the ticket file
(`.ai/tickets/<key>/<key>.md`), runs its whole flow and stops at the points where only you can decide.
`/wake` and `/ticket` no longer exist: every command starts with the session checklist and ends by
recording the session.

**Several people on one ticket.** The ticket is a folder: the shared file `<key>.md` (intent, analysis, impact,
verification, review, decisions) and one diary per developer, `<key>.<you>.md` (your current state, your changes,
your sessions). You write your diary; you never edit a teammate's — so the knowledge repo merges without conflicts.
The plan's phases carry their owner.

**The ticket header.** While a ticket is active (`.ai/current-ticket.local.md`, written by the command), a plugin
adds ≤10 lines to every message: the key, the services, your `Next:`, who else is on it and the step the ticket's
state calls for (no gate evidence after the last edit → the gate; open CRITICAL findings → fix them all, then the
incremental review; a skill this change touched still unreviewed → close step 1). After a compaction the summary
keeps the ticket's state, decisions and dead ends.

---

## The workspace, day to day

| You want to… | Do this |
|---|---|
| See what changed in a service | `git status` / `git diff` inside `<service>/`, as always (or `git -C <service> …` from the workspace folder) |
| Start the branches of a ticket | Knowledge repo: `git -C .ai switch -c feature/<Jira key> master`; in each service the ticket touches `git -C <service> switch -c feature/<Jira key> <base branch>` (base branch per service: `.ai/orchestrator.md` → Services). The command tells you when a branch is not there; it never switches |
| Commit the knowledge of a ticket | The command proposes one message covering everything the ticket changed under `.ai/` — ticket file, plan, known issue, context, integrations — as `git -C .ai add <paths>` (paths relative to `.ai/`). You decide when; the agent never checks |
| Open the knowledge pull request | At `waiting-validation` and at close: push `feature/<Jira key>`, pull request to `master` (template in `.gitlab/`) |
| Change the system's knowledge outside a ticket (`/start`, `/restart`, `CONTEXT.md` decisions, methodology updates) | Its own pull request |
| Your journal and time (`.ai/MEMORY.local.md`) | Nothing — git-ignored. The close step gives you the per-day worklog for Jira |
| Get the team's latest knowledge — and methodology | `git -C .ai pull` on `master`. The commands tell you when `origin/master` is ahead. If the pull changed `.ai/install/`, re-run `powershell -File .ai\install\install-opencode.ps1` |
| Add a service to the workspace | Clone it beside `.ai/`, `/start <service>`, review, its own pull request |
| Ask the agent to search the knowledge base | Say where: *"search `.ai/known-issues/` for …"*. A search from the workspace folder also walks every service's code |

**Never** let anything of the methodology land inside a service folder — the commit guard in each
service refuses it, and the reviewer flags it. The workspace folder is not a repository: every git
command for the knowledge repo is written `git -C .ai …` from it, and for a service
`git -C <service> …` (or inside the service folder).

---

## `/analysis <key>` — a production problem, analysed

**What it asks you:** in one question — the EUIPO reference, the services involved (it proposes
them from the symptom), the Jira description pasted (it summarises it; it never copies it), and your
own estimate of the effort without the agent, in hours. Then it stops once more for the effort
figure of the Jira analysis.

**What it does:** prior art by similarity (known issues and tickets of every service, GoJira when
available, recent changes in the service and in its providers), evidence (logs, code across the
service boundary, a reproduction when the service runs locally), the resolution, the list of
components possibly affected when another service, contract or library is involved, and
`## Analysis` in the exact Jira format with `<to confirm>` where your figure goes.

**What you do next:** give the effort figure; paste the analysis into Jira; if EUIPO validates
before the fix, commit the ticket file and open the pull request — the ticket waits in
`waiting-validation`. When the validation arrives, `/bugfix <key>`. Analysis-only outcomes
(data issue, configuration, works as designed, cannot reproduce…) close here, with the known issue.

**Stops:** the header · the effort figure · the session record (time confirmed by you).

## `/bugfix <key>` — a confirmed defect, fixed

**What it needs:** the analysed ticket (`resolution: code-defect`) — or your diagnosis in the intake
question if you skip `/analysis`. A hotfix on a release branch: say the target branch; it is
recorded in the ticket and used by the reviewer.

**What it does:** a plan through the `architect` agent when the fix is more than ten lines in one
file or touches two services, DB, a contract, security or deployment (you approve it, and choose
implement/delegate); the regression test **red first**, then the minimum fix, then the service's
full gate — with the output line as evidence; the review by a fresh-context subagent (CRITICAL →
fixed and reviewed again, at most twice), `security` when auth, SQL or an endpoint is touched; the
knowledge files the change made stale; `## Test instructions` in the Jira format; the closure
checks; the worklog per day; one commit message per repository.

**Stops:** the header · the plan · the review verdict · the close (time and the "pasted into Jira?"
questions are yours).

## `/adaptive <key>` — a change request or a new capability

**What it asks you:** the same intake, plus `adaptive` (an existing behaviour changes) or
`development` (something new). A refactor is an adaptive ticket with "behaviour unchanged" as a
boundary.

**What it does:** `## Impact analysis` — scope, the contracts and resources touched and, from
`integrations.md`, **the components possibly affected**, one line each, for you to decide what to do
with; risks; delivery order (provider before consumers); effort `<to confirm>`. `waiting-validation`
when EUIPO must approve it. Then the plan (`architect`, phases per service in the delivery order),
implementation phase by phase with the gate at the end of each one, review (+ `security`, + `tester`
for new logic), the knowledge updates (the provider's `api.md` and `integrations.md` for every
contract changed), test instructions, closure.

**Stops:** the header · the effort figure · the plan · the review verdict · the close.

---

## The helpers

- **`/architect`** — design critique with a verdict (`APPROVABLE` · `REVIEW DESIGN` ·
  `NOT RECOMMENDED`) and, if approvable, a persisted plan in `.ai/plans/<key>-plan.md`. The ticket
  commands call it when they need a plan; you can call it for any design question.
- **`/reviewer`** — the fresh-context review on its own: one diff per service of the ticket, a closed
  checklist, a verdict with what it checked and found clean, and the independence disclosure. It is
  the same model that probably wrote the code — context isolation, not model diversity. For auth,
  SQL, public contracts or the data model, **your review is not optional**.
- **`/security`** — the separate audit: injection, auth bypass, secrets in logs, with a traced path
  for every finding. It lists the dependency versions touched; the organisation's scanner says the rest.
- **`/tester`** — the missing tests, in the service's own patterns, run there; what is not
  automatable becomes a manual step in the ticket, never a fake test.
- **`/learning`** — a lesson to keep: a gotcha of one service (its `service.md`) or of the system
  (`orchestrator.md`), a business rule (a skill), a recurring bug pattern (the known issue), or a
  proposal to decide later. `/learning promote` turns a repeated note into a fixed rule.
- **`/impact [<key>]`** — the deterministic part of an impact analysis: the diff of every service mapped to its
  methods, matched against the files and methods the skills, known issues and closed tickets cite — the flows to
  re-test, the past bugs on the same path. Read-only.
- **`/touchpoints <term>`** — every place a status, field, role, route or message lives, in every service, grouped
  by the kind of place (config, enums, controllers, templates, translations, tests — Drupal: option maps,
  permissions, form alters, config sync, Twig). The checklist of a change.
- **`/doctor`** — one table: Node, `project.json` vs the services cloned, the per-machine wiring and its version,
  the commit guard, the prompts vs the model gateway, the context budget, the indexes, each service's tools and
  code checks — with the one fix for each problem.
- **`/start`**, **`/start <service>`**, **`/restart [service]`** — bootstrap and re-sync: the
  Services table, `integrations.md` (derived from the catalogs and verified against the code), one
  `service.md` with its `context/` per service. Their output is reviewed by you and committed in its
  own pull request.

You can also address an agent yourself with `@name` — `@reviewer check only the changes under
design-domain/rcd/…/dao`, `@tester`, `@security`, `@architect`, `@executor` for a closed, scoped
implementation with a fresh context (one service per scope), `@explore` for a cheap read-only
search (name the folder; it walks every service). Subagents run in a child session and return a
summary, not their transcript — that is what protects the main session's context.

---

## The rules that do not change

- **The agent never commits** — in no repository. It hands you the diff and a proposed message per
  repo; you commit, and it never checks whether you did.
- **The agent never writes to Jira.** It drafts the analysis, the test instructions and the worklog;
  you post them.
- **Nothing of the methodology inside a service folder.**
- **`services:` is the permission.** A ticket touches the services it lists; another one means
  updating the ticket first.
- **One owner per contract.** The provider documents it; `integrations.md` says who consumes it;
  a change lists the components possibly affected, and you decide.
- **Verified, not assumed.** `[VERIFIED <date> @sha — "<evidence line>"]` means a command was run and
  its output line is quoted. Everything else is `[ASSUMED]`, including anything with no label and
  anything read from a catalog.
- **The gate decides — per service.** Build and tests are the one reviewer that is not a language
  model; what only an environment can verify is a manual procedure in `CONTEXT.md`, not a claim.
- **Someone else's uncommitted work in a service is untouchable** until the agent has read the
  diff, recorded it, and you have decided.
- **Channel honesty.** If a step could not run as designed — no subagent, `bash` denied, a GoJira
  tool missing — the agent says so and records it. Never accept "independently reviewed" from a
  session that did not do it.
- **Your estimate, your time.** The manual estimate at intake and the confirmed time at close are
  yours; the agent only puts them side by side. It never estimates what the work "would have cost
  without AI".

Full reasoning: `.ai/METHODOLOGY.md`. The always-in-force rules: `.ai/non-negotiables.md`.
Who plays which role: `.ai/routing.md`. What is written where: `.ai/session/tracking.md`.
