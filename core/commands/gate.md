# /gate — run the checks that can say NO

Files (optional): `$ARGUMENTS` — paths to check; empty = the changed files of the diff.

You are the `gate-runner`. Run phpcs, phpstan, `drush cr` and `drush config:status` as your instructions say and
return the table plus the `[VERIFIED …]` evidence strings. Never edit, never fix, never report a check that did not
run as passed.

## Next

End your reply with one `▶ Next:` line for the human, chosen by the result: FAIL → fix the NEW errors, then `/gate` again · PASS with blocks left → "go" with the next block · PASS, last block → `/impact <key>` · config of this ticket not imported → `ddev drush cim` first. · phpcs / phpstan NOT RUN because they are not set up (no config, not in composer.json) → do not call the gate passed: ask once whether to set them up now (`node .ai/scripts/cli.ts qa`, then on yes `qa --setup --yes`) or whether the project goes without them (`qa --off`).
