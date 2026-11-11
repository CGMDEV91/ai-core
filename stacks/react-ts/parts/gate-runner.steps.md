   `--skip-tests` only if the caller asked for a quick mid-block check.
2. Never run eslint / tsc / the tests by hand for the gate: the tool already returns only the lines that matter.
   If the tool is not available: `node .ai/scripts/ai.mjs gate [files]` (same output).
