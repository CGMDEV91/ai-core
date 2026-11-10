#!/usr/bin/env bash
# scan-callpaths.sh — generated "stack trace" of every business skill + related skills.
#
#   bash .ai/scripts/knowledge/scan-callpaths.sh            # report skills whose ## Call path / related_skills are out of date
#   bash .ai/scripts/knowledge/scan-callpaths.sh --update   # (re)write them into skills/*/SKILL.md
#   bash .ai/scripts/knowledge/scan-callpaths.sh --show 12-amendment-lifecycle   # preview one skill
#
# Seeds = the methods a skill cites (Key files + `Class::method()`); callees resolved in lib/, 2 levels deep.
# Logic: .ai/scripts/lib/callpaths.py (python3, standard library only).
set -euo pipefail
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
exec python3 -I "$LIB/callpaths.py" "$@"
