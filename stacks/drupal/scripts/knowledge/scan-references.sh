#!/usr/bin/env bash
# scan-references.sh — mechanical consistency check of skills, tickets and known issues (no LLM).
#   bash .ai/scripts/knowledge/scan-references.sh            # full check (incl. freshness of generated files)
#   bash .ai/scripts/knowledge/scan-references.sh --quick    # skip freshness (pre-commit guard)
#   bash .ai/scripts/knowledge/scan-references.sh --json
# Exit 1 when there is an ERROR. Logic: .ai/scripts/lib/references.py. Interpreted by the knowledge-auditor agent (/audit).
set -euo pipefail
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
exec python3 -I "$LIB/references.py" "$@"
