#!/usr/bin/env bash
# run-gate.sh — the gate in one run (phpcs, phpstan, api-signatures, drush cr, smoke, config:status), from the project root.
# Usage (from the project or anywhere): bash .ai/scripts/gate/run-gate.sh [--base REF] [--skip-drush] [files…]
# Logic: .ai/scripts/lib/gate.ts — also: node .ai/scripts/cli.ts gate […] (Windows without bash: from the project root).
set -euo pipefail
AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$AI_DIR/.."
exec node --experimental-strip-types --no-warnings "$AI_DIR/scripts/cli.ts" gate "$@"
