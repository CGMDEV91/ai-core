# Agents — when, how and why to run each one

Which agent runs at each moment, how you launch it, when it makes sense **on its own** (outside a ticket) and at which
step of the **flow** it comes in. At the end: how the AI proposes the next command.

## Three ways an agent runs

| Way | Example | Use it |
|---|---|---|
| **Command** `/x` | `/gate`, `/review ABC-123` | **Almost always.** The command carries the step's instructions (what to read, write, report) and launches the subagent with its permissions |
| **Mention** `@agent` | `@code-scout where is getOwnerId used?` | A one-off question without the command's script. Good for exploring; for a flow step, prefer the command |
| **Automatic** | the main agent delegates to `@fullstack-developer` or `@gate-runner` | Decided by the main agent inside `/ticket`; you do nothing |

Only **you** can type a command. So the AI never runs one: it **proposes** it (see the end).

## Why a subagent instead of the main agent

- **Clean context:** it starts without your conversation, so it carries no assumptions; its long output (linters,
  searches, logs) stays in its context and only the summary reaches your session. Fewer tokens, less noise.
- **Independent opinion:** `code-reviewer` and `security-reviewer` did not write the code they review.
- **Least privilege:** most cannot edit anything; the ones that write only touch their ticket section.
- **Cost:** each subagent re-reads what it needs. For a one-line question, just ask.

## Each agent: in the flow and on its own

| Agent | Command | Flow step | Use it alone when… | Returns / writes |
|---|---|---|---|---|
| `build` (main) | — | all | always there | code and `.ai/` (never git) |
| `code-scout` | `/touchpoints a, b` | 1, automatic in adaptive work | you want to know where a status, field, role or method lives **before** a ticket, or to estimate | grouped `file:line` list; no edits |
| `debugger` | `/debug <symptom>` | 1–2 in correctives with unknown cause | you got an error or stack trace and want the proven cause without touching code | diagnosis with evidence; no fix |
| `backend-architect` | `/plan <key>` | 3, before code | you want design options for an idea, even if not doing it yet | `## Plan` with verdict and blocks |
| `fullstack-developer` | (launched by the main agent) | 4, one plan step | not used alone | that step's code |
| `gate-runner` | `/gate [files]` | 5, end of every block | you want the stack's checks (Drupal: phpcs, phpstan, cache, config) on any change, even without a ticket | pass/fail table, NEW vs PRE-EXISTING errors, `[VERIFIED]` |
| — (tool) | `/impact <key>` | 8, code finished | you want the flows a commit or branch can break (`--commit`, `--files`) | `## Impact` + what to re-test |
| `code-reviewer` | `/review <key> [--full]` | 9 | you want to review someone else's branch or diff | the `## Review` block (R1…, severity, status, file hashes); round 2 only re-checks open findings and changed files; max 2 rounds |
| `security-reviewer` | `/security <key>` | 9, if access, roles, web services or personal data change | you want a security pass on any diff | findings with evidence; no edits |
| `test-designer` | `/tests <key>` | 10 | you need a test checklist for QA | `### Manual checklist` |
| `skill-curator` | `/skill <key>` (and inside `/close`) | 11 | you want to decide whether a piece of work deserves a new or updated skill | recommendation; writes only after your yes |
| `jira-writer` (applied by the main agent) | `/jira <key>` | 12, optional | you need the Jira texts of a ticket | summary, analysis comment, test instructions, worklog — in `## Jira drafts` **and shown in the conversation** to copy; never writes to Jira |
| `knowledge-auditor` | `/audit` | outside the flow | after moving or renaming skills, tickets or known issues, or once per sprint | table of broken references and fixes |

## What the AI proposes and where it comes from

Every reply that finishes a step ends with one line like this (what to do and why):

> ▶ **Next:** `/gate` — checks block A before moving to B.

And if you ask for something a command already does ("run the linter", "what else can this break?"), it does not
improvise: it answers `▶ /gate — …` or `▶ /impact ABC-123 — …`.

The proposal comes from three places, most reliable first:

1. **The ticket's state** (plugin `ticket-context`, deterministic). On every message it finds the first gap in the flow:

| If the ticket… | It proposes |
|---|---|
| is adaptive and has no plan | `/plan <key>` |
| has no changes | "go" with the first block, or `/debug` if the cause is unknown |
| has changes without gate evidence (or newer than the last gate) | `/gate` |
| the last gate has NEW errors | fix them and `/gate` again |
| has unticked blocks (`- [ ]` under `Blocks:`) | "go" with the next block |
| has no `## Impact` | `/impact <key>` |
| has open BLOCKER/MAJOR findings in `## Review` / `## Security` | fix them **all at once**, `/gate`, then `/review` (incremental round); after 2 rounds: you decide each one |
| has no `## Review` (nor `Review:` in Notes) | `/review <key>` (+ `/security` if access changed) |
| has no manual checklist | `/tests <key>` |
| has no `[VERIFIED-BY-HUMAN]` | test in the browser and report |
| all of the above done | `/close <key>` |

2. **Each command's `## Next` block:** when it finishes, the command picks by its result (e.g. gate FAIL → "fix the
   NEW errors and `/gate`"; PASS on the last block → `/impact`).
3. **The rule in `core-rules.md`:** the "intent → command" map for requests outside the flow.

If the proposal does not fit (e.g. you want to pause), do something else: it is a suggestion, never run by itself.
