#!/usr/bin/env bash
# run.sh — the safety net of the AI infrastructure: run it before and after touching .ai/scripts.
#   bash .ai/tests/run.sh            # all tests
#   bash .ai/tests/run.sh --bless    # rewrite the golden files (only after checking the change is wanted)
# 1. suggest() unit tests                       (core, any project)
# 2. golden.mts, when the project has one: reference outputs of its stack's tools on a fixed snapshot of the project
# Node ≥ 22.6, no dependencies; on Windows without bash: node --experimental-strip-types .ai/tests/golden.mts
set -uo pipefail
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
echo "== suggest()"
node --experimental-strip-types --no-warnings --test --test-reporter=dot "$T/suggest.test.mts" || rc=1
if [ -f "$T/golden.mts" ]; then
    echo "== golden outputs"
    node --experimental-strip-types --no-warnings "$T/golden.mts" "$@" || rc=1
fi
[ $rc = 0 ] && echo "ALL PASS" || echo "SOMETHING FAILED"
exit $rc
