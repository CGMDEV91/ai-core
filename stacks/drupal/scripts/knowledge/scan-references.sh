#!/usr/bin/env bash
# scan-references.sh — mechanical consistency of the knowledge base (skills, tickets, known issues, freshness).
#   bash .ai/scripts/knowledge/scan-references.sh [--quick] [--json] [--commit-gate]
# Logic: .ai/scripts/lib/references.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts references [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" references "$@"
