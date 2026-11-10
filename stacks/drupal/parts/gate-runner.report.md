- `config:status` = CHECK: list the items. If they are this ticket's own config files (edited in `config/sync`), say
  they are **not imported yet** — the feature cannot be tested until the human runs `ddev drush cim` — and that
  `{{drush}} cr` passing proves nothing about them. Other items: probably local drift, mention them once.
- `api-signatures` FAIL: quote the `expected` signature and its `*.api.php` line — the fix is to copy it.
- `smoke` FAIL: a path answered 5xx, or watchdog holds a PHP error naming a changed file after its last edit (often a
  TypeError from a wrong signature, or an error the human hit while testing). Quote it; it is NEW.
- The exec environment down (e.g. ddev) → tell the human to start it (`ddev start`).
