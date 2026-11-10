| Check | Inside the `gate` tool | Evidence to quote |
|---|---|---|
| Compile | Maven / Gradle compile (main + test) | `compile: 0 new error(s)` |
| Style | Checkstyle (XML), when the build has it | `checkstyle: 0 new issue(s)` |
| Tests | JUnit XML (surefire / Gradle) | `tests: N passed, 0 failed` — a failing test always fails the gate |
| Behaviour | Manual call of the endpoint / flow by the human | `[VERIFIED-BY-HUMAN <date> — "<what they saw>"]` |

Record every result with its evidence line; a gate that was not run is reported as not run.
