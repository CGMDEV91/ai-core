#!/usr/bin/env bash
# install.sh — wires this checkout to its knowledge repo (.ai/): git hooks, exclude, opencode.json + stubs, indexes.
# Run once per clone, and again after a `git -C .ai pull` that changed scripts/setup/ or scripts/opencode/:
#   bash .ai/scripts/setup/install.sh [--no-indexes | --uninstall]
# Logic: .ai/scripts/lib/setup.ts — from Windows without bash: node --experimental-strip-types .ai/scripts/cli.ts setup
set -euo pipefail
command -v node >/dev/null 2>&1 || { echo "ERROR: Node ≥ 22.6 is required (nodejs.org)" >&2; exit 1; }
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" setup "$@"
