#!/usr/bin/env bash
# upgrade.sh — bring this project's .ai to the latest ai-core (pull, show what changes, update, re-wire). Never commits.
#   bash .ai/scripts/setup/upgrade.sh [--yes]     — Windows without bash: node --experimental-strip-types .ai/scripts/cli.ts upgrade
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" upgrade "$@"
