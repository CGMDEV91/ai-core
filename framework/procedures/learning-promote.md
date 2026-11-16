# Procedure — /learning promote: from loose note to fixed rule

Read by `/learning` only in promotion mode. A promoted rule goes to destination (1) of
`.ai/procedures/learning-destinations.md`.

## Promotion mode — from loose note to fixed rule (recurrences)

**When**: you say "promote learnings" / `/learning promote`, or you notice the same pattern showing
up **2–3 times or more** across the project's history.

**Why**: history only GROWS. A gotcha that has already recurred several times should stop being a
loose note buried in an append-only log and become a **fixed rule** the model sees whenever it
works on that service.

**Where to look for recurrences** (in this order — the first two exist in every tool). Search them
with the grep tool and an **explicit path** (a search from the workspace folder also walks every
service's code), by keyword — never read the tickets by date:
1. **`.ai/known-issues/`** — the primary source, for every service of the workspace. A "Pattern to
   watch" that has reappeared in 2+ known issues (or a known issue whose `related` lists several
   keys) is the clearest promotion candidate there is. Its `services:` says where the rule belongs.
2. **`.ai/tickets/`** — the same area or the same mistake surfacing across tickets: their `Dead end:`
   and `Decision` lines.
3. **The tool's own auto-memory, only if it has one** (Claude Code keeps per-project memory files;
   opencode has no equivalent). If your tool has none, skip this source — do not invent it, and do
   not report it as checked. The two sources above are sufficient.

**Process**:
1. Review those sources. Identify patterns that (a) repeat across several entries, or (b) are stable,
   already-proven rules rather than isolated observations.
2. For each candidate, propose:
   ```
   This pattern has already come up N times: "<pattern>".
   Should I promote it to FIXED RULE (### Known Gotchas of .ai/services/<name>/service.md —
   or of .ai/orchestrator.md if it spans services) and clean up the N loose notes from auto-memory? (y/n)
   ```
   Also consider the known issues as a source: a "Pattern to watch" that has reappeared in 2+
   known issues is a promotion candidate too (promote the rule; known issues are never deleted).
3. **Only with confirmation** (memory deletion is destructive → maximum caution):
   - Apply destination (1) of `.ai/procedures/learning-destinations.md` (permanent gotcha → the service's `service.md`, or the orchestrator).
   - **Dry-run before deleting anything**: once the rule is saved, LIST the exact auto-memory
     entries that would become redundant (file + line + text), and ask for a **second explicit
     confirmation** ("Should I delete these N entries? y/n") before touching them.
   - Only then delete those entries, one by one as listed — never in bulk, never with wildcards.
     **Never** delete anything before the rule is saved.
   - **Known issues and ticket files are never deleted, and existing known issues are not
     rewritten.** Promotion copies the rule out; the history stays. Only a tool's own auto-memory is
     ever pruned.
4. Never promote rules or delete memory without explicit "yes" (and without the second "yes" for deletion).
   If you doubt whether a pattern is stable, leave it in memory and say so — when in doubt, DO NOT promote.
