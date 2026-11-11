#!/usr/bin/env bash
# scan-touchpoints.sh — every place a concept lives (status, field, role, doc type…), grouped. The checklist of a feature.
#   bash .ai/scripts/analysis/scan-touchpoints.sh union_registered [--case] [--max N]
# Logic: .ai/scripts/lib/touchpoints.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts touchpoints [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" touchpoints "$@"
