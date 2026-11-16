---
name: 04-tickets-and-the-header
description: The ticket as a folder with one diary per developer, ticket new, receipts and their fold at close, the ticket header and suggest() (the step the ticket's state calls for), the compaction context, the compact hint and the ▶ Next line. Read before changing ticket.ts, receipts.ts, ticketctx.ts, session.ts, next.ts or the ticket templates.
---

# SKILL-04 — Tickets, receipts and the header

## Rules in force
- **A ticket is a folder** `.ai/tickets/<KEY>/`: the shared `<KEY>.md` and one diary `<KEY>.<user>.md` per developer
  (Current state, Changes, Session log, Receipts). Only its owner writes a diary. The user name: `$AI_DEV`, else the
  saved `.ai/user.local.json`, else git `user.name` as a slug (`knowledge.ts` → `devUser()`); `knowledge merge-user`
  joins two diaries of one person.
- **`ticket new <KEY> --type --title [--services] [--euipo-ref] [--estimate] [--owner] [--base]`** renders the
  template: the same keys and sections in the same order, no comments, baseline sha per service from git, owner,
  dates; then the diary and `.ai/current-ticket.local.md`. An existing ticket is never created twice. It prints a
  one-line guide per section from the template's comments.
- **Receipts**: a tool (the gate) writes its own line in the diary's `## Receipts`
  (`- gate <scope> · <date time> · exit N · "RESULT: …" · @sha · #hash`), its full output in
  `.ai/context/receipts/` (local). An edit after it makes it **stale**. At close `receipts fold <KEY>` turns the newest
  of each tool into one `## Verification` line of the shared file, removes `## Receipts` and the local outputs;
  folding again replaces, never adds.
- **The header** (`header()`, ≤10 lines): key, title, type, status, services, skills, shared file, your diary, your
  `Next:`, who else is on it and what they hold, the step `suggest()` gives, open `[QUESTION]`s. Attached to the
  message **only when it changed** (and again after a compaction) — never in the system prompt.
- **`suggest()` order**: done → nothing · waiting-validation → wait · corrective without analysis → `/analysis` ·
  adaptive without impact analysis → impact · no edit → the command · gate receipt stale / failed / incomplete →
  `/gate` · no gate evidence → `/gate` · open BLOCKER/MAJOR → fix (two rounds, then the human) · no review → review ·
  no test instructions → write them · no `## Knowledge` → the skill question (update the stale skill, or no skill
  because…) · a stale skill not named → update it · else close.
- **Compact hint** (`compactHint()`): only at the end of a phase (gate receipt passed, no edit after) and above
  `AI_COMPACT_AT` (60k) tokens of context, measured by the plugin's `event` hook in `.ai/context/session.local.json`.
- **▶ Next**: every finished command runs `ai.mjs next` and repeats its lines — the step, then non-blocking chores.

## Key files
- `framework/scripts/lib/ticket.ts` — `render()`, `guide()`, `main()`
- `framework/scripts/lib/receipts.ts` — `writeReceipt()`, `gateState()`, `fold()`
- `framework/scripts/lib/ticketctx.ts` — `activeTicket()`, `header()`, `suggest()`, `compactionContext()`, `ticketHeader()`
- `framework/scripts/lib/session.ts` — `recordContext()`, `compactHint()`
- `framework/scripts/lib/knowledge.ts` — `devUser()`, `diaryFile()`, `combined()`
- `framework/scripts/lib/next.ts` · `framework/templates/ticket.template.md` · `ticket-diary.template.md`
- `tests/opencode.test.mts` (header, receipts, compact hint, ticket new) · `tests/team.test.mts` · `tests/impact.test.mts`

## History
- 2026-11-10 — ai-core 0.10: per-developer diaries, ticket folders.
- 2026-11-12 — header off the system prompt; ▶ Next.
- 2026-11-13 — receipts, fold at close, compact hint, `ticket new`.
