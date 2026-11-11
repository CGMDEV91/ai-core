#!/usr/bin/env bash
# selftest.sh — ai-core checks on this machine (no pipeline). Logic: selftest.ts
set -euo pipefail
exec node --experimental-strip-types --no-warnings "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/selftest.ts" "$@"
