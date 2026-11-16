## Drupal — commands and gate

Drush by its real command names, never a short alias (`cr`, `cex`, `cim`, `cst`) nor a shell alias: the commands in
tickets, plans and test instructions must run for anyone. `{{drush}} cache:rebuild` · `config:export` ·
`config:import` · `config:status` · `updatedb` · `pm:install <module>`.

**The gate** — one run for the automatic checks: {{gate}} (or `/gate`). Never phpcs, phpstan or the drush checks by
hand: a check run by hand has no NEW / PRE-EXISTING split and its evidence is not the gate's.

| Check | Inside the gate | Evidence to quote |
|---|---|---|
| Coding standard | phpcs ({{phpcs}}) on the changed PHP | `phpcs: 0 new issue(s)` |
| Static analysis | phpstan{{phpstan}} on the changed PHP | `phpstan: 0 new error(s)` — new errors are fixed, never baselined |
| API signatures | hook implementations in the changed files vs the installed `*.api.php` | `api-signatures: 0 new mismatch(es)` — a mismatch is a TypeError waiting to happen |
| Container/caches | `drush cache:rebuild` | `Cache rebuild complete.` |
| Smoke | the paths of `.ai/context/smoke-paths.txt` (no 5xx) + no new PHP error naming a changed file | `smoke: N path(s) without 5xx, 0 new PHP error(s)` — add the pages of your flow to the file |
| Config | `drush config:status` | no differences — this ticket's own `{{configSync}}/` files listed = **not imported yet** (`config:import`), so nothing using them was tested |
| Behaviour | the human in the browser (role · status · language) | `[VERIFIED-BY-HUMAN <date> — "<what they saw>"]` |

Every result goes to the ticket's `## Verification` with its evidence line; a check that did not run is reported as not run.

**Claims about Drupal:** a hook, interface method or event signature is copied from the installed code
(`node .ai/scripts/ai.mjs where <hook> --kind hook` gives its `*.api.php` line), never written from memory. Before
changing access, permissions or a workflow, list the handlers that already decide it
(`node .ai/scripts/ai.mjs where ENTITY_ACCESS --kind event`, `/touchpoints <permission>`). The rest of the Drupal
rules: `.ai/rules/stacks/drupal.md`, read with the service's `service.md`.
