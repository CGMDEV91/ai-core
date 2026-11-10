#!/usr/bin/env bash
# review.sh — ticket digest and review rounds for /review and /security (read-only).
#   bash .ai/scripts/review/review.sh digest <key>
#   bash .ai/scripts/review/review.sh state <key> [--section Security] [--full]
# Logic: .ai/scripts/lib/review.py (python3, standard library only).
set -euo pipefail
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
exec python3 -I "$LIB/review.py" "$@"
