#!/usr/bin/env bash
# run.sh — the safety net of the AI infrastructure: run it before and after touching .ai/scripts.
#   bash .ai/tests/run.sh            # all tests
#   bash .ai/tests/run.sh --bless    # rewrite the golden files (only after checking the change is wanted)
# 1. suggest() unit tests (node ≥ 22.6, TypeScript stripped natively)
# 2. golden outputs of index, touchpoints, impact, references, callpaths and gate on a fixed snapshot (tests/golden.py)
set -uo pipefail
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rc=0
echo "== suggest() (node)"
node --experimental-strip-types --no-warnings --test --test-reporter=dot "$T/suggest.test.mts" || rc=1
echo "== golden outputs (python)"
python3 -I "$T/golden.py" "$@" || rc=1
[ $rc = 0 ] && echo "ALL PASS" || echo "SOMETHING FAILED"
exit $rc
