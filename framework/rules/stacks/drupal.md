# Rules — Drupal services

<!-- NOT always loaded: read it with the service.md of every Drupal service the ticket lists (the service.md
     points here). The always-loaded rules in .ai/rules/*.md still apply; these add what is specific to Drupal.
     The gate (node .ai/scripts/ai.mjs gate) checks the mechanical part: phpcs, phpstan, hook signatures,
     drush cache:rebuild, a smoke request, config:status — NEW findings only. -->

## Code
- **Framework signatures come from the installed code, never from memory**: a hook, an interface method or an event
  subscriber is copied from `node .ai/scripts/ai.mjs where <hook> --kind hook` (it gives the `*.api.php` line) or
  from the interface file. The ticket plugin checks the signature on every edit of a `.module`/`.inc`/`.theme`.
- Services are injected through the constructor and registered in `<module>.services.yml` — no `\Drupal::service()`
  in classes that can take a dependency (only in procedural hooks and static contexts).
- Access is decided by `hook_entity_access()` / `hook_node_access()` or an access event subscriber — never inline in
  a controller or a form. Before changing access, permissions or a workflow: list the existing handlers
  (`node .ai/scripts/ai.mjs where ENTITY_ACCESS --kind event`, `/touchpoints <permission>`).
- Database: the entity API or the query builder with placeholders — never a concatenated SQL string
  (`.ai/rules/sql-safety.md`). Logging through the module's logger channel — never `print`, `var_dump`, `dpm` left
  behind. User-facing strings through `t()` / `$this->t()` (and `|t` in Twig): the translations live in `.po` files.
- Custom code lives in the service's custom module folders (`.ai/project.json` → `paths`); never patch core or a
  contributed module in place — a patch goes in `composer.json` → `extra.patches`.

## Commands
- Drush by its real command names, always: `drush config:import`, `config:export`, `config:status`, `config:get`,
  `config:set`, `cache:rebuild`, `sql:query` (with ddev: `ddev drush <the same>`). Never a short alias (`cim`, `cex`,
  `cst`, `cr`, `sqlq`) and never a developer's own shell alias: the commands in the ticket, the plans and the test
  instructions must run for anyone.

## Configuration
- Configuration is exported, never hand-written: change it in the site, then `drush config:export` (ddev: `ddev drush config:export`) and
  review the YAML diff. A new field needs its storage, its instance, and the form and view displays.
- `config:status` must be clean at the end of the ticket (the gate reports it): a difference nobody exported is a
  change that will not reach the next environment.
- After a structural change (a service, a route, a hook, a plugin): `drush cache:rebuild`, then
  `node .ai/scripts/ai.mjs detect --index` so `where`, `callers` and `impact` see it.

## SonarQube
- A `sonar-project.properties` (a `sonar.projectKey`) in the service: SonarQube runs at the end of the ticket with
  `node .ai/scripts/ai.mjs gate --sonar` (sonar-scanner; `node .ai/scripts/ai.mjs qa` says what this machine lacks).
  No key: the service is not on SonarQube.

## Verifying for real
- Exercise the flow in the browser with the role that uses it (ddev: the site URL of `ddev describe`); a page that
  renders is not a flow that works. What cannot be automated goes as manual steps into `## Verification`.
