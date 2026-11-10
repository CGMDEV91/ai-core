#!/usr/bin/env bash
# review.sh — ticket digest and review rounds for /review and /security (read-only).
#   bash .ai/scripts/review/review.sh digest <key>
#   bash .ai/scripts/review/review.sh state <key> [--section Security] [--full]
# Logic: .ai/scripts/lib/review.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts review [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" review "$@"
