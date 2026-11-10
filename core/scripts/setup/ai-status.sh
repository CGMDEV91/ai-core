#!/usr/bin/env bash
# ai-status.sh — is the knowledge repo (.ai) behind its remote? `git fetch` + counts. /ticket runs it before starting.
#   bash .ai/scripts/setup/ai-status.sh      (Windows without bash: node --experimental-strip-types .ai/scripts/cli.ts sync --remote)
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" sync --remote
