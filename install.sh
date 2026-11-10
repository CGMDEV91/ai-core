#!/usr/bin/env bash
# install.sh — install / update ai-core in a project (Linux, WSL, macOS). Windows: install.ps1.
#   ~/devel/ai-core/install.sh <project-dir> [--update | --reconfigure | --status | --promote … | --uninstall] [--yes …]
# Everything else: ~/devel/ai-core/install.sh --help  (logic: install.ts, Node ≥ 22.6, no dependencies)
set -euo pipefail
command -v node >/dev/null 2>&1 || { echo "ERROR: Node ≥ 22.6 is required — https://nodejs.org" >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=6)?0:1)' \
  || { echo "ERROR: Node $(node --version) is too old — ≥ 22.6 runs TypeScript natively" >&2; exit 1; }
exec node --experimental-strip-types --no-warnings "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.ts" "$@"
