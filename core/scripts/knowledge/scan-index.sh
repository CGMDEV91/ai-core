#!/usr/bin/env bash
# scan-index.sh — code index for the opencode tools `where` and `callers` (.ai/context/code-index.json).
#   bash .ai/scripts/knowledge/scan-index.sh            # report whether the index is up to date
#   bash .ai/scripts/knowledge/scan-index.sh --update   # rebuild it
# Logic: .ai/scripts/lib/codeindex.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts codeindex [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" codeindex "$@"
