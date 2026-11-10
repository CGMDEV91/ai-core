#!/usr/bin/env bash
# hooks.sh — install / uninstall ai-core's git hooks without replacing the project's own (EC toolkit, GrumPHP, Husky…).
#   bash .ai/scripts/setup/hooks.sh install | uninstall
# Logic: .ai/scripts/lib/setup.ts (node .ai/scripts/cli.ts hooks install|uninstall — also from Windows without bash).
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" hooks "${1:-install}"
