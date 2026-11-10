Never call phpstan through bash: its text output carries prose for AI agents that the security rules block.

| Check | Inside the `gate` tool | Evidence to quote |
|---|---|---|
| Coding standard | phpcs (`phpcs.xml`) on the changed PHP | `phpcs: 0 new issue(s)` |
| Static analysis | phpstan (JSON) on the changed PHP | `phpstan: 0 new error(s)` — new errors are fixed, never baselined; errors on untouched lines are reported apart |
| API signatures | hook implementations in the changed files vs the installed `*.api.php` (`.ai/context/api-index.json`) | `api-signatures: 0 new mismatch(es)` — a mismatch is a TypeError waiting to happen |
| Container/caches | `{{drush}} cr` | `Cache rebuild complete.` |
| Smoke | the paths of `.ai/context/smoke-paths.txt` (no 5xx) + watchdog: no PHP error naming a changed file after its last edit | `smoke: N path(s) without 5xx, 0 new PHP error(s)` — add the pages of your flow to the file |
| Config | `{{drush}} config:status` | no differences — this ticket's own `config/sync` files listed = **not imported yet** (`{{drush}} cim`), so nothing using them was tested |
| Behaviour | Manual check in the browser by the human (role · status · language) | `[VERIFIED-BY-HUMAN <date> — "<what they saw>"]` |

Record every result with its evidence line; a gate that was not run is reported as not run.
