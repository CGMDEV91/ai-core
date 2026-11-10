#!/usr/bin/env bash
# scan-known-issues.sh — regenerates .ai/known-issues/INDEX.md from the front matter of every known issue.
#   bash .ai/scripts/knowledge/scan-known-issues.sh            # print what is stale
#   bash .ai/scripts/knowledge/scan-known-issues.sh --update   # rewrite INDEX.md (never edit it by hand)
# Logic: .ai/scripts/lib/knownissues.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts knownissues [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" knownissues "$@"
