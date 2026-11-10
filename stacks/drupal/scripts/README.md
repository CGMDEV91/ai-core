# scripts/ — every script of the knowledge base, grouped by what it does

Run them from the **{{repo}} root**. Every script is a thin wrapper of `node .ai/scripts/cli.ts <command>` (Node ≥ 22.6,
TypeScript run as is, no dependencies): without bash (Windows) call the CLI directly, e.g. `node .ai/scripts/cli.ts gate`.
Most of them are also reached through opencode commands and tools — you rarely need to call them by hand.

| Folder | Script | What it does | Used by |
|---|---|---|---|
| `drift/` | `scan-content-model.sh [--update]` | content types / paragraphs / taxonomies vs snapshot + field docs | `/scan` |
| `knowledge/` | `scan-known-issues.sh [--update]` | regenerates `known-issues/INDEX.md` | `/close` |
| | `scan-callpaths.sh [--update \| --show <skill>]` | short `## Call path` + `related_skills` in each skill; full tree in `context/callgraph.json` | `/close`, `/scan`, skill-curator |
| | `scan-index.sh [--update]` | `context/code-index.json` (methods + line ranges, routes, events, hooks, fields, UI texts) | tools `where`, `callers` |
| | `scan-references.sh [--quick \| --commit-gate \| --json]` | consistency of skills / tickets / known issues | `/audit`, pre-commit |
| `analysis/` | `scan-impact.sh [--key K] [--files … --methods …] [--commit SHA] [--write-ticket K] [--skill-signals] [--check]` | side effects of a change: flows, past bugs, past tickets | tool `impact`, `/impact`, `/review`, `/close` |
| | `scan-touchpoints.sh <term>` | every place a status / field / role / string lives | tool `touchpoints`, `/touchpoints`, `/ticket` (automatic) |
| `cli.ts` + `lib/` | `impact` · `callpaths` · `codeindex` · `touchpoints` · `references` · `gate` · `apiindex` · `review` · `knownissues` · `md2html` (`lib/<command>.ts`; `util.ts`, `project.ts` shared) | the logic behind the wrappers: `node .ai/scripts/cli.ts <command> [args]` | the wrappers, the opencode tools, git hooks |
| `gate/` | `run-gate.sh [--base REF] [--skip-drush] [files…]` | phpcs + phpstan (JSON) + api-signatures + `drush cr` + smoke + `config:status` in one run; NEW vs PRE-EXISTING errors; `[VERIFIED]` lines | tool `gate`, `/gate`, gate-runner |
| `setup/` | `install.sh`, `hooks.sh` | wires a checkout: hooks (chained with the project's own; `hooks.sh uninstall` restores them), exclude, `opencode.json`, tool/plugin stubs, code index | once per clone, after a pull |
| | `opencode.json` | the opencode wiring copied to the project root (instructions, skills, agents, commands, permissions) | `install.sh` |
| | `pre-commit-guard.sh` | blocks secrets, e-mails, hidden Unicode, AI files in the project repo, broken references in `.ai` | git (both repos) |
| `opencode/` | `tool/where.ts` · `callers.ts` · `touchpoints.ts` · `impact.ts` · `gate.ts` · `_lib.ts` | opencode tools (stubs in `<project>/.opencode/tool/`) | the agents |
| | `plugin/ticket-context.ts` | injects the active ticket header in every message and its state into compaction summaries | opencode |
| | `plugin/ticket-changes.ts` | records every edited file in the active ticket's `## Changes` and appends phpcs results to each PHP edit (`AI_PHPCS_ON_EDIT=0` disables it) | opencode |
| `benchmarks/` | `bench.js` | with / without infra cost from transcripts | by hand |
| | `impact_backtest.mts` | would `/impact` have warned? recall on {{repo}}'s history | by hand |
| `docs/` | `build-pdf.sh` | builds `docs/pdf/*.pdf` from the quick guides and the walkthroughs | by hand |
| `../tests/` | `run.sh` (`suggest.test.mts`, the project's `golden.mts`, `fixtures/gate/ddev`) | safety net: `suggest()` unit cases + golden outputs of the stack's tools on a fixed snapshot of the project | before and after any change to `scripts/` |
| `lib/` | `apiindex.ts` | the installed framework API: hook signatures from the `*.api.php` of core + contrib → `context/api-index.json` (`--update`, `--show <hook>`, `--check <files>`); used by `where` kind `hook`, the on-edit check and the gate's `api-signatures` row | install; after a core/contrib update |
| `review/` | `review.sh` (`lib/review.ts`) | `digest <key>`: the ticket in ~1/7 of its size for the reviewers · `state <key> [--section Security] [--full]`: FULL / INCREMENTAL / STOP round, open findings, files changed since the last round (by hash) | `/review`, `/security` |
