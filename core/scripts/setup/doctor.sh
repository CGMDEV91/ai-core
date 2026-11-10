#!/usr/bin/env bash
# doctor.sh — is this checkout's AI set-up healthy? (hooks, opencode wiring, indexes, exec environment, ai-core version)
#   bash .ai/scripts/setup/doctor.sh        — Windows without bash: node --experimental-strip-types .ai/scripts/cli.ts doctor
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" doctor "$@"
