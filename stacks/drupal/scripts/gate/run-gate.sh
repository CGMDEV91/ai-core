#!/usr/bin/env bash
# run-gate.sh — the gate in one run: phpcs, phpstan (JSON), drush cr, drush config:status on the changed files.
# Prints a pass/fail table, NEW vs PRE-EXISTING errors and the [VERIFIED …] lines. Never edits anything.
# Usage (from giportal or anywhere): bash .ai/scripts/gate/run-gate.sh [--base REF] [--skip-drush] [files…]
# Exit: 0 pass · 1 fail · 2 not run. Logic: scripts/lib/gate.py (why JSON for phpstan: see its docstring).
set -uo pipefail
AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$AI_DIR/.." || exit 2
exec python3 -I "$AI_DIR/scripts/lib/gate.py" "$@"
