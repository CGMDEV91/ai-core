# scripts/ — every script of the knowledge base, grouped by what it does

Run them from the **{{repo}} root** (from a Windows shell: `wsl.exe -d Ubuntu-24.04 -- bash -lc 'cd <giportal> && …'`).
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
| `lib/` | `impact.py` · `callpaths.py` · `codeindex.py` · `touchpoints.py` · `references.py` · `gate.py` | the Python behind the scanners (standard library only) | — |
| `gate/` | `run-gate.sh [--base REF] [--skip-drush] [files…]` | phpcs + phpstan (JSON) + `drush cr` + `config:status` in one run; NEW vs PRE-EXISTING errors; `[VERIFIED]` lines | tool `gate`, `/gate`, gate-runner |
| `setup/` | `install.sh`, `hooks.sh` | wires a checkout: hooks (chained with the project's own; `hooks.sh uninstall` restores them), exclude, `opencode.json`, tool/plugin stubs, code index | once per clone, after a pull |
| | `opencode.json` | the opencode wiring copied to the project root (instructions, skills, agents, commands, permissions) | `install.sh` |
| | `pre-commit-guard.sh` | blocks secrets, e-mails, hidden Unicode, AI files in the project repo, broken references in `.ai` | git (both repos) |
| `opencode/` | `tool/where.ts` · `callers.ts` · `touchpoints.ts` · `impact.ts` · `gate.ts` · `_lib.ts` | opencode tools (stubs in `giportal/.opencode/tool/`) | the agents |
| | `plugin/ticket-context.ts` | injects the active ticket header in every message and its state into compaction summaries | opencode |
| | `plugin/ticket-changes.ts` | records every edited file in the active ticket's `## Changes` and appends phpcs results to each PHP edit (`AI_PHPCS_ON_EDIT=0` disables it) | opencode |
| `benchmarks/` | `bench.js` | with / without infra cost from transcripts | by hand |
| | `impact_backtest.py` | would `/impact` have warned? recall on {{repo}}'s history | by hand |
| `docs/` | `build-pdf.sh` | builds `docs/pdf/*.pdf` from the quick guides and the walkthroughs | by hand |
| `../tests/` | `run.sh` (`suggest.test.mts`, `golden.py`, `fixtures/gate/ddev`) | safety net: `suggest()` unit cases + golden outputs of index, touchpoints, impact, references, callpaths and gate (fake ddev) on a fixed giportal/.ai snapshot | before and after any change to `scripts/` |
| `lib/` | `apiindex.py` | the installed framework API: hook signatures from the `*.api.php` of core + contrib → `context/api-index.json` (`--update`, `--show <hook>`, `--check <files>`); used by `where` kind `hook`, the on-edit check and the gate's `api-signatures` row | install; after a core/contrib update |
| `review/` | `review.sh` (`lib/review.py`) | `digest <key>`: the ticket in ~1/7 of its size for the reviewers · `state <key> [--section Security] [--full]`: FULL / INCREMENTAL / STOP round, open findings, files changed since the last round (by hash) | `/review`, `/security` |
