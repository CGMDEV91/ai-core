# /doctor — is the AI set-up of this checkout healthy?

Run `bash .ai/scripts/setup/doctor.sh` (from a Windows shell without bash:
`node --experimental-strip-types .ai/scripts/cli.ts doctor`) and show its table as returned. Then, for each FAIL and
WARN, the one fix it prints — in the human's language, shortest first. Do not run the fixes yourself: setup, `--update`,
`git pull/push` and `ddev start` are the human's.

**Code checks** (WARN `code checks`: phpcs / phpstan not set up) is a project decision — ask it as **one** question
with three answers:
1. *Set them up now* → run `node .ai/scripts/cli.ts qa` and show its steps (composer require, phpcs.xml, phpstan.neon);
   on the human's yes run `node .ai/scripts/cli.ts qa --setup --yes`, then `node .ai/scripts/cli.ts qa` to confirm,
   and remind that composer.json, composer.lock and the two config files are a commit **in the project**.
2. *The project goes without them* → `node .ai/scripts/cli.ts qa --off` (the gate marks them SKIPPED), then the
   `.ai` commit of `project.json`.
3. *Later* → nothing now; the gate will show them NOT RUN.

## Next

End your reply with one `▶ Next:` line: FAIL → the first fix to run · only WARN → the fix that matters for the current
ticket (indexes out of date before `/impact`, exec down before `/gate`, code checks not set up → the question above) ·
OK → back to the ticket (`/ticket`).
