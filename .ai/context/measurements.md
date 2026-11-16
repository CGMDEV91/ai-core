# Measurements — what a session costs

_Last updated: 2026-11-16_

## A real 3.3 session (ideapow, one adaptive ticket, opencode + the Qwen gateway)

| Measure | Value |
|---|---|
| model time | ~82 min, of which ~70 min the model **writing** (output tokens are the slow part) |
| input tokens sent | 8.28 M in total (no prefix cache: the conversation is re-sent on every call) |
| peak context | ~168k tokens |

What followed from it: brief answers (non-negotiable 8), short fixed subagent reports relayed once, procedures read in
parts, the ticket header attached only when it changed, the compact hint at the end of a phase, the gate writing
its own receipt. How to measure again: copy `opencode.db` (+ `-wal`, `-shm`), then sum the tokens per message of the
session (tables `session`, `message`, `part`).

## Always loaded (every message)

| Set-up | Tokens (≈ chars / 4) |
|---|---|
| ideapow, opencode, orchestrator written by the model | ~3,000 |
| ideapow, opencode, orchestrator built by `orchestrator --write` (Drupal block included) | ~3,580 (budget 4,000) |
| ideapow clone, Claude Code (`CLAUDE.md` imports, before `/start`) | ~2,260 |
| ticket header | ~150 per message, only when it changed |

`node .ai/scripts/ai.mjs budget` prints it; doctor's `context` row warns over the budget.

## The ticket file

Compacting the shared ticket at close took an example ticket from ~1,780 to ~1,255 tokens (30% less) with nothing lost.
