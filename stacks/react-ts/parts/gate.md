| Check | Inside the `gate` tool | Evidence to quote |
|---|---|---|
| Lint | eslint (JSON) on the changed sources | `eslint: 0 new issue(s)` — issues on untouched lines are reported apart |
| Types | `tsc --noEmit` on the project | `tsc: 0 new error(s)` |
| Tests | vitest / jest (JSON) | `vitest: N passed, 0 failed` — a failing test always fails the gate |
| Behaviour | Manual check in the browser by the human (route · state · viewport) | `[VERIFIED-BY-HUMAN <date> — "<what they saw>"]` |

Record every result with its evidence line; a gate that was not run is reported as not run.
