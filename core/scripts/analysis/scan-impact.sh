#!/usr/bin/env bash
# scan-impact.sh — which workflows (skills), past bugs (known issues) and past tickets a change can affect.
#
#   bash .ai/scripts/analysis/scan-impact.sh                          # current giportal diff (staged + unstaged + untracked)
#   bash .ai/scripts/analysis/scan-impact.sh --base origin/<branch>   # + commits of the branch
#   bash .ai/scripts/analysis/scan-impact.sh --ticket <key>           # from the ticket's ## Changes
#   bash .ai/scripts/analysis/scan-impact.sh --files <path>... [--methods Class::method ...]
#   bash .ai/scripts/analysis/scan-impact.sh --write-ticket <key>     # also write the ## Impact section of the ticket
#   bash .ai/scripts/analysis/scan-impact.sh --files <path>... --skills-only   # skill names, for a front-matter `skills:` list
#   bash .ai/scripts/analysis/scan-impact.sh --commit <sha>             # one existing commit
#   bash .ai/scripts/analysis/scan-impact.sh --check                  # skills citing paths / Class::method() that no longer exist
#
# Logic: .ai/scripts/lib/impact.ts (Node ≥ 22.6, no dependencies) — also: node .ai/scripts/cli.ts impact [args…]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" impact "$@"
