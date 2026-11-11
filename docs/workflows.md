# Workflows — corrective and adaptive, step by step

Who does what at every step: what **you** type, what runs **behind** (main agent, subagents, tools, plugin), what gets
written, where it **stops** for you, and where **side effects** are checked (★).

Main agent = opencode's `build` agent in your session. Subagents run with a clean context and their own permissions.

```
CORRECTIVE  /ticket ─► (analysis) ─► (/plan) ─► fix + gate ─► ★/impact ─► /review ─► you test ─► /close ─► you commit
ADAPTIVE    /ticket ─► touchpoints ─► /plan ─► steps + gate ─► /scan ─► ★/impact ─► /review ─► you test ─► /close ─► you commit
                 ★ risk before coding                                        ★ gate: every ⚠ flow re-tested or ruled out
```

---

## 1. Corrective — something is broken

| # | You type | Behind it | Writes | Stops for you |
|---|---|---|---|---|
| 1 | `/ticket ABC-123 <symptom>` | **main agent** loads the skills of the area · reads `known-issues/INDEX.md` · tools **`where`** / **`callers`** to locate the code · ★ **risk**: the `impact` tool (`--files … --methods …`) before touching anything | `tickets/ABC-123/ABC-123.md` (intent, boundaries, modules, skills, known_issues, prior art) · `.ai/current-ticket.local.md` | **one question**: confirm intent, boundaries, modules |
| 2 | *(cause unknown)* `/debug ABC-123` | **subagent `debugger`**: prior art, `where`/`callers`, max 3 hypotheses with evidence, `git log -S`/blame — proven root cause, no fix | `## Notes` (cause, ruled out) | "fix follows?" |
| 3 | `/plan ABC-123` *(only if not small)* | **subagent `backend-architect`**: options, self-critique, verdict, steps | `## Plan` | approve the option |
| 4 | "go" | **main agent** fixes, or **subagent `fullstack-developer`** per plan step · **plugin** records every edited file and lints it · **subagent `gate-runner`** (`/gate`): the stack's checks (Drupal: phpcs, phpstan, `drush cr`, config status; React: eslint, tsc, tests; Java: compile, Checkstyle, JUnit) — only pass/fail + errors | `## Changes` (auto) · `## Verification` with evidence | — |
| 5 | `/impact ABC-123` ★ | **tool `impact`**: changed methods → flows (skills) whose call path contains them, past bugs on the same path, past tickets of the same flows | `## Impact` + re-test checklist | — |
| 6 | `/review ABC-123` (+ `/security` if access, roles, web services or personal data changed) | **subagent `code-reviewer`** (read-only): its own diff vs skill rules, "Pattern to watch" of past bugs, past tickets, files outside `modules:` · **subagent `security-reviewer`**: access / injection / exposure paths | verdicts in `## Notes` | fix findings if any |
| 7 | `/tests ABC-123`, then you test the change **and** each ⚠ flow | **subagent `test-designer`** writes the manual checklist; you report the result | `### Manual checklist` · `[VERIFIED-BY-HUMAN …]` | — |
| 8 | `/close ABC-123` | **main agent**: re-runs impact (gate) · known issue created/updated + `INDEX.md` · **subagent `skill-curator`** recommends EDIT / CREATE / NOTHING · `scan-references` · clears the active ticket | `known-issues/…` · `## Closure` · `## Session log` · `MEMORY.local.md` | **one question** about skills; then the commit messages |

Optional at close: `/jira ABC-123` (the main agent, with the `jira-writer` instructions) drafts the summary, analysis comment, test instructions and worklog under `## Jira drafts` and shows them in the conversation to copy.

**More work on a closed ticket:** `/ticket <key> <what>` asks whether to reopen it; on yes the shared file goes back to `active` with a `Reopened` note and new plan blocks, your work goes to your diary, and the next `/close` adds a Closure entry.

**It ends with you:** `git commit -m "ABC-123: …"` in the project, and
`git -C .ai add tickets/ABC-123/ABC-123.md known-issues/… skills/…` + commit in `.ai` (the agent never commits).
Stopping halfway: `/end` saves where you are; `/ticket ABC-123` resumes.

## 2. Adaptive — extend something or build something new

| # | You type | Behind it | Writes | Stops for you |
|---|---|---|---|---|
| 1 | `/ticket ABC-456 <what to add> [--touchpoints a,b] [--no-auto]` | **main agent** (type `feature`) · skills of the area · **automatic `touchpoints`** on the concept you extend (e.g. the ownership check) = every place it lives, each marked "touch / not" · **`where`** for the handlers of the Drupal event involved and the closest existing implementation · ★ **automatic `impact`** on the code located — all **before** any plan | ticket with intent, boundaries, modules, `## Open points`, `## Prior art` | **one question**, then business decisions one at a time |
| 2 | `/plan ABC-456` *(always for adaptive)* | **subagent `backend-architect`**: options (incl. contrib / config-only), verdict, steps with files, config export, scanners and skills that will change | `## Plan` | approve |
| 3 | "go" | per step: **subagent `fullstack-developer`** · plugin records changes · gate per step · the config export when config changed (Drupal: `drush cex`) | `## Changes`, `## Verification` | review each step if you want |
| 4 | `/scan` *(new service, field, content type or form alter)* | **main agent** runs the drift scanners; documentation first, then `--update` | `context/…` | — |
| 5 | `/impact ABC-456` ★ | tool `impact` | `## Impact` | — |
| 6 | `/review ABC-456` | subagent `code-reviewer` | verdict | — |
| 7 | you test | — | `[VERIFIED-BY-HUMAN …]` | — |
| 8 | `/close ABC-456` | as in corrective; the **skill-curator** usually recommends **CREATE** (a new flow) or **EDIT** (an existing flow grew) | new or updated skill, regenerated call paths | **one question** |

Ends the same way: you commit both repositories.

## 2b. Before /close — the ticket's knowledge into a skill

When the change is verified, ▶ Next proposes **`/skill <key>`**: it reads the whole ticket folder (the shared file and
every dev's diary), decides CREATE / EDIT / NOTHING, asks once, writes the skill and links both ways (the skill's
`tickets:`, the ticket's `skills:`), always leaves a short `## Knowledge` in the ticket and offers to shorten it — the
detail lives in the skill. The skill cites the changed files and methods: that is what `/impact` matches next time.
If the client must approve the analysis first, the ticket waits in `status: waiting-validation` until
`/ticket <key> approved`.

## 3. Where side effects are checked (★)

1. **Before touching code** — `/ticket` runs the `impact` tool (`--files … --methods …`) on what you are about to change and
   tells you which other flows and past bugs share it.
2. **After the change** — `/impact` on the real diff writes the re-test checklist (`## Impact`).
3. **In the review** — `code-reviewer` checks the diff against the rules of every ⚠ flow and the patterns of past bugs.
4. **Gate at close** — `/close` will not close while a ⚠ flow has neither "re-tested" nor "checked, not affected — why".

A flow is flagged only when the **changed method is in its call path**. A flow that merely uses the same class
(different methods) is not flagged — that keeps the list short.

## 4. Who is who

| Name | Kind | Can edit | Called by |
|---|---|---|---|
| `build` | main agent | code + `.ai` (no git writes) | you |
| `backend-architect` | subagent | only `tickets/**` (the Plan) | `/plan` |
| `fullstack-developer` | subagent | code of the step | main agent |
| `code-reviewer` | subagent | nothing (read-only) | `/review` |
| `skill-curator` | subagent | `.ai/**` after your yes | `/skill`, `/close` |
| `knowledge-auditor` | subagent | `.ai/**` after your yes | `/audit` |
| `code-scout` | subagent | nothing (read-only) | `/touchpoints`, `@code-scout` |
| `gate-runner` | subagent | nothing | `/gate`, after each block |
| `debugger` | subagent | nothing (read-only) | `/debug` |
| `security-reviewer` | subagent | nothing (read-only) | `/security` |
| `test-designer` | subagent | the ticket's checklist | `/tests` |
| `jira-writer` | instructions applied by the main agent (`@jira-writer` still works) | the ticket's Jira drafts | `/jira` |
| `where` · `callers` · `touchpoints` · `impact` | tools | — | any agent |
| `ticket-changes` | plugin | the active ticket's `## Changes` (+ lint feedback on each edit) | every edit |
| `ticket-context` | plugin | — (injects the active ticket header; keeps it through compaction) | every message |

## 4b. Running agents alone, and the ▶ Next line

Every agent above can also run **outside a ticket** (e.g. `/touchpoints` to estimate, `/debug` on a stack trace,
`/review` or `/security` on someone else's branch, `/gate` on any change). When to do it, `/command` vs `@agent`,
and why a subagent: [agents-when.en.md](agents-when.en.md). After each step the AI ends with `▶ Next: /command — why`:
the plugin `ticket-context` computes it from the ticket's state, each command's `## Next` block refines it.

## 5. Rules that always apply

- Several points asked at once → each one goes to `## Open points` and is answered in a table; nothing is dropped.
- Business decisions are asked one at a time and never decided by the agent.
- Claims about code come from code the agent read (`where` + line range); otherwise `[ASSUMED]`.

- The agent **never** commits, pushes or switches branches; you do.
- Nothing is "done" until **you** confirm it works; evidence lines or it is `[ASSUMED]`.
- One ticket per piece of work; one known issue per confirmed bug; skills only after you say yes.
- No AI file ever enters the project's git (the pre-commit guard blocks it).
