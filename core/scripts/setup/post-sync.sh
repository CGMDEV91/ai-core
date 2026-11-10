#!/usr/bin/env bash
# post-sync.sh — git post-merge / post-checkout / post-rewrite (both repos, through the ai-core hook wrappers): after a pull, merge or
# branch switch, regenerate known-issues/INDEX.md and the stack's indexes IN THE BACKGROUND, so `where`, `callers` and
# `impact` answer from the code you now have. Never blocks git. Log: .ai/context/.sync.log
set -u
AI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# post-checkout gets <prev> <new> <branch-flag>: only a branch switch that moved HEAD (not a file checkout).
# post-rewrite gets "amend" or "rebase": only a rebase (git pull --rebase) brings other people's work.
[ "${1:-}" = amend ] && exit 0
if [ $# -ge 3 ]; then { [ "$3" = 1 ] && [ "$1" != "$2" ]; } || exit 0; fi
command -v node >/dev/null 2>&1 || exit 0
[ -f "$AI_DIR/scripts/cli.ts" ] || exit 0
mkdir -p "$AI_DIR/context"
( cd "$AI_DIR/.." && node --experimental-strip-types --no-warnings "$AI_DIR/scripts/cli.ts" sync > "$AI_DIR/context/.sync.log" 2>&1 & )
exit 0
