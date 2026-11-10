#!/usr/bin/env bash
# scan-touchpoints.sh — every place a concept lives (status, field, role, doc type…), grouped. The checklist of a feature.
#   bash .ai/scripts/analysis/scan-touchpoints.sh union_registered [--case] [--max N]
# Logic: .ai/scripts/lib/touchpoints.py (python3, standard library only).
set -euo pipefail
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
exec python3 -I "$LIB/touchpoints.py" "$@"
