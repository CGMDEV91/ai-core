---
name: 09-docs-and-guides
description: How the README, CHANGELOG, the EN/ES quick guides, their timelines and PDFs are written and built, and the house writing rules. Read before writing user-facing documentation of ai-core.
---

# SKILL-09 — Docs and guides

## Rules in force
- **What goes where**: `README.md` (install, startup, ticket flow, commands, subagents, agents, tools, stacks,
  updating, changing the framework) · `CHANGELOG.md` (one entry per release, what changed for users and why) ·
  `docs/quick-guide.{en,es}.md` (how to use it, with console samples and timelines) · `framework/scripts/README.md`
  (every tool) · `framework/HOW_TO.md` (inside projects, for the team).
- **House style of the guides**: plain sentences; no em dashes and no semicolons in prose; no mentions of other
  repositories; English and Spanish kept as twins (same sections, same tables); no personal paths (`<you>`).
- **Build**: the Markdown is the source. `python3 docs/build/build_docs.py` draws `docs/img/*.svg` (timelines from
  `timelines.py`) and prints a PDF of each guide through Edge or Chrome headless (`--headless=new
  --no-pdf-header-footer --print-to-pdf`). PDFs are not committed (`docs/.gitignore`). On a WSL machine without a PDF
  viewer: check the layout with Edge screenshots, the page count with a regex on the PDF.
- A user-visible change updates README and both guides in the same commit.

## Key files
- `README.md` · `CHANGELOG.md` · `docs/quick-guide.en.md` · `docs/quick-guide.es.md`
- `docs/build/build_docs.py` · `docs/build/timelines.py`

## History
- 2026-11-12 — 3.3 quick guides, timelines and the presentation.
- 2026-11-16 — guides moved to ai-core and neutralised; README rewritten (startup, commands, subagents, agents).
