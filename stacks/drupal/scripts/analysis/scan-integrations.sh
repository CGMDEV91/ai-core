#!/usr/bin/env bash
# scan-integrations.sh — integrations (REST, HTTP clients, OpenID, mail, cron, queues) from code + config.
#   bash .ai/scripts/analysis/scan-integrations.sh            # what changed since the snapshot (read-only)
#   bash .ai/scripts/analysis/scan-integrations.sh --update   # context/integrations.md + context/modules/*.md + snapshot
# Logic: .ai/scripts/lib/integrations.ts — also: node .ai/scripts/cli.ts integrations [--update]
set -euo pipefail
CLI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/cli.ts"
exec node --experimental-strip-types --no-warnings "$CLI" integrations "$@"
