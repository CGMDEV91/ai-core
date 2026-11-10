#!/usr/bin/env bash
# scan-index.sh — code index for the opencode tools `where` and `callers` (.ai/context/code-index.json).
#   bash .ai/scripts/knowledge/scan-index.sh            # report whether the index is up to date
#   bash .ai/scripts/knowledge/scan-index.sh --update   # rebuild it
# Logic: .ai/scripts/lib/codeindex.py (python3, standard library only).
set -euo pipefail
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
exec python3 -I "$LIB/codeindex.py" "$@"
