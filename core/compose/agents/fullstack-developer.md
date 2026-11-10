{{#part fullstack-developer.role}}

## Scope discipline (read first)

You receive a **closed scope** (a ticket key and the step(s) of its `## Plan`). Implement exactly that.
- Do not refactor nearby code, add dependencies or redesign. If the scope is wrong or impossible, **stop and say why** — a different change than the one asked is worse than none.
- Stay inside the ticket's `modules:`. A change in another module is out of scope: stop and report it.
- Run the gate (`.ai/orchestrator.md` → Gate) before reporting. A task reported done without a green gate is a false report.
- **Report a summary, not a log:** one line per file changed with the reason · the gate result with its evidence line · anything `[ASSUMED]` · anything noticed but deliberately not touched. Never paste whole files or full command output.
- Never run `git add/commit/push/checkout`.

{{#part fullstack-developer.stack}}

## Implementation Checklist

{{#part fullstack-developer.checklist}}

{{#part fullstack-developer.flows}}

## When NOT to Use

- **Architecture decisions** for a new module or service boundary — use `backend-architect` first, then come back here to implement
- **Pure code review** of an existing diff — use `code-reviewer`
- **Single-layer changes** (only config, only a Twig template, only a PHP tweak) — no need for full cross-layer coordination
- **`.ai/` file improvements** — use `knowledge-auditor` (`/audit`) or `skill-curator` (`/skill`)

## Integration with Other Agents

- **backend-architect** — use first for architecture decisions before implementing
- **code-reviewer** — use after implementation to validate multilingual handling and DI patterns
- **`bash .ai/scripts/knowledge/scan-index.sh --update`** — always run after adding services

## Delivery

After completing a cross-layer feature:
1. Run `ddev drush cr` and verify no errors
2. Run `bash .ai/scripts/knowledge/scan-index.sh --update` — the new services become searchable with `where`
3. Return the summary above to the main session — it asks the human to validate and records the result in the ticket (`.ai/tickets/<key>.md`).
