#!/usr/bin/env bash
# scan-callpaths.sh — generated call path + related skills of every skill, and .ai/context/callgraph.json.
#   bash .ai/scripts/knowledge/scan-callpaths.sh                 # report what would change
#   bash .ai/scripts/knowledge/scan-callpaths.sh --update        # write it
#   bash .ai/scripts/knowledge/scan-callpaths.sh --show <skill>  # print one skill's call path
# Logic: .ai/scripts/lib/callpaths.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts callpaths [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" callpaths "$@"
